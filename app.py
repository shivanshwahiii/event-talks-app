import xml.etree.ElementTree as ET
import urllib.request
import urllib.error
import re
import html
import time
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    'data': None,
    'last_fetched': 0,
    'ttl': 300  # 5 minutes
}

def clean_html_to_text(html_str):
    # Decode HTML entities (e.g., &amp; -> &, &lt; -> <)
    text = html.unescape(html_str)
    
    # Format links nicely: <a href="LINK">TEXT</a> -> TEXT (LINK)
    # But since Twitter has a character limit, we keep text clean and put the main link in the footer.
    # So we'll replace links with just their text inside the content.
    text = re.sub(r'<a\s+[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', r'\2', text)
    
    # Replace list items with bullets and add spacing
    text = re.sub(r'<li>(.*?)</li>', r'• \1\n', text)
    
    # Replace block level elements with newlines
    text = re.sub(r'</?(p|ul|ol|li|div|h3|h4|h5|h6|code|pre)[^>]*>', '\n', text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    
    # Strip any remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Clean up whitespace on each line, filter empty lines
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join([line for line in lines if line])
    return text

def generate_tweet_text(date, update_type, clean_text, link_url):
    # Twitter link length counts as 23 characters.
    # Tweet template: "BigQuery Update ({date}) - [{type}]: {text}\n\n{link}"
    # Header: "BigQuery Update (June 22, 2026) - [Feature]: "
    # Link: "\n\nhttps://docs.cloud.google.com/..." -> 23 characters for link plus 2 newlines (25 chars)
    # Hashtags: " #BigQuery #GoogleCloud" -> 23 chars
    # We will build it dynamically
    header = f"BigQuery Update ({date}) - [{update_type}]: "
    footer = f"\n\n#BigQuery #GoogleCloud {link_url}"
    
    # link_url counts as 23 chars, the rest of the footer counts normally.
    # "\n\n#BigQuery #GoogleCloud " is 24 chars, plus 23 for link_url = 47 chars.
    # Header length = len(header)
    # Limit for text = 280 - len(header) - 47
    
    max_text_len = 280 - len(header) - 47
    
    if max_text_len < 10:
        return f"BigQuery Update ({date}) - {link_url}"
        
    # Replace multiple spaces/newlines with a single space for Twitter
    single_line_text = re.sub(r'\s+', ' ', clean_text).strip()
    
    if len(single_line_text) > max_text_len:
        single_line_text = single_line_text[:max_text_len - 3] + "..."
        
    return f"{header}{single_line_text}{footer}"

def fetch_and_parse_feed():
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BigQueryReleaseNotesApp/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        
        # Parse Atom XML
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        root = ET.fromstring(xml_data)
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_elem = entry.find('atom:title', ns)
            id_elem = entry.find('atom:id', ns)
            updated_elem = entry.find('atom:updated', ns)
            link_elem = entry.find('atom:link[@rel="alternate"]', ns)
            if link_elem is None:
                link_elem = entry.find('atom:link', ns)
            content_elem = entry.find('atom:content', ns)
            
            date_str = title_elem.text if title_elem is not None else "Unknown Date"
            entry_id = id_elem.text if id_elem is not None else ""
            updated_str = updated_elem.text if updated_elem is not None else ""
            link_url = link_elem.attrib.get('href', '') if link_elem is not None else ""
            content_html = content_elem.text if content_elem is not None else ""
            
            # Split HTML content by h3 tags into individual updates
            parts = re.split(r'<h3>(.*?)</h3>', content_html)
            
            if len(parts) > 1:
                # Content has h3 tags (parts[0] is typically text before first h3)
                for i in range(1, len(parts), 2):
                    update_type = parts[i].strip()
                    update_html = parts[i+1].strip() if i+1 < len(parts) else ""
                    
                    if not update_html:
                        continue
                        
                    clean_text = clean_html_to_text(update_html)
                    tweet_text = generate_tweet_text(date_str, update_type, clean_text, link_url)
                    
                    # Generate a unique ID for this specific sub-update
                    anchor = entry_id.split('#')[-1] if '#' in entry_id else date_str.replace(" ", "_").replace(",", "")
                    sub_id = f"{anchor}_{i//2}"
                    
                    entries.append({
                        'id': sub_id,
                        'date': date_str,
                        'updated_raw': updated_str,
                        'type': update_type,
                        'html': update_html,
                        'text': clean_text,
                        'tweet_text': tweet_text,
                        'link': link_url
                    })
            else:
                # No h3 tags, treat the whole content as one update
                clean_text = clean_html_to_text(content_html)
                tweet_text = generate_tweet_text(date_str, "Update", clean_text, link_url)
                
                anchor = entry_id.split('#')[-1] if '#' in entry_id else date_str.replace(" ", "_").replace(",", "")
                
                entries.append({
                    'id': anchor,
                    'date': date_str,
                    'updated_raw': updated_str,
                    'type': 'Update',
                    'html': content_html,
                    'text': clean_text,
                    'tweet_text': tweet_text,
                    'link': link_url
                })
        
        return entries, None
    except Exception as e:
        return [], str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or not cache['data'] or (now - cache['last_fetched'] > cache['ttl']):
        data, err = fetch_and_parse_feed()
        if err:
            # If we have cache, fallback to cache on error
            if cache['data']:
                return jsonify({
                    'releases': cache['data'],
                    'cached': True,
                    'warning': f"Failed to fetch live feed: {err}. Displaying cached data."
                })
            return jsonify({'error': f"Failed to fetch release notes: {err}"}), 500
        
        cache['data'] = data
        cache['last_fetched'] = now
        
    return jsonify({
        'releases': cache['data'],
        'cached': now - cache['last_fetched'] > 0 and (now - cache['last_fetched'] < cache['ttl']) and not force_refresh,
        'last_updated': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache['last_fetched']))
    })

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
