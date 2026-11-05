export function getStorageToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("Document storage is not configured. Set BLOB_READ_WRITE_TOKEN.");
  }
  return token;
}
