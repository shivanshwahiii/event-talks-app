import os
import shutil

def organize():
    # Source directory is the directory containing this script
    source_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Destination folders
    dest_images = os.path.join(source_dir, "Images")
    dest_docs = os.path.join(source_dir, "Documents")
    dest_videos = os.path.join(source_dir, "Videos")
    
    # Create destinations if they don't exist
    for folder in [dest_images, dest_docs, dest_videos]:
        if not os.path.exists(folder):
            os.makedirs(folder)
            
    # Track actions
    moved_count = 0
    
    print(f"Scanning directory: {source_dir}")
    
    for filename in os.listdir(source_dir):
        file_path = os.path.join(source_dir, filename)
        
        # Skip directories
        if os.path.isdir(file_path):
            continue
            
        # Skip project core files and the script itself to prevent breaking the app
        if filename in ["organize_files.py", "app.py", "requirements.txt", ".gitignore", "test_feed.py"]:
            continue
            
        # Get extension in lower case
        ext = os.path.splitext(filename)[1].lower()
        
        target_folder = None
        if ext in ['.jpg', '.jpeg', '.gif']:
            target_folder = dest_images
        elif ext == '.txt':
            target_folder = dest_docs
        elif ext == '.mp4':
            target_folder = dest_videos
            
        if target_folder:
            dest_path = os.path.join(target_folder, filename)
            # Handle potential duplicate name collisions
            if os.path.exists(dest_path):
                name, extension = os.path.splitext(filename)
                counter = 1
                while os.path.exists(os.path.join(target_folder, f"{name}_{counter}{extension}")):
                    counter += 1
                dest_path = os.path.join(target_folder, f"{name}_{counter}{extension}")
                
            shutil.move(file_path, dest_path)
            print(f"Moved: {filename} -> {os.path.basename(dest_path)} in {os.path.basename(target_folder)}")
            moved_count += 1
            
    if moved_count == 0:
        print("No files matching (.jpg, .jpeg, .gif, .txt, .mp4) were found to move.")
    else:
        print(f"Successfully organized {moved_count} file(s).")

if __name__ == "__main__":
    organize()
