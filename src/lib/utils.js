// lib/utils.js
// Client-safe utilities - no server dependencies

export function generateTripcode(password) {
  if (!password) return null;
  
  // Simple tripcode generation (in production, use proper crypto)
  // Note: This is a simplified version for client-side preview
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return '!' + Math.abs(hash).toString(16).substring(0, 8);
}

export function parseContent(content) {
  if (!content) return '';
  
  // Parse >>references
  content = content.replace(/>>(\d+)/g, '<a href="#post-$1" class="text-blue-600 hover:underline">&gt;&gt;$1</a>');
  
  // Parse >greentext
  content = content.replace(/^(&gt;|>)(.+)$/gm, '<span class="text-green-600">&gt;$2</span>');
  
  // Parse line breaks
  content = content.replace(/\n/g, '<br>');
  
  return content;
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function truncateFilename(filename, maxLength = 16) {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  
  if (filename.length <= maxLength) return filename;
  
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return filename.substring(0, maxLength - 3) + '...';
  }
  
  const ext = filename.substring(lastDotIndex);
  const name = filename.substring(0, lastDotIndex);
  
  const availableLength = maxLength - ext.length - 3;
  if (availableLength <= 0) {
    return ext.length <= maxLength ? ext : ext.substring(0, maxLength - 3) + '...';
  }
  
  const truncated = name.substring(0, availableLength) + '...';
  return truncated + ext;
}