// A queued-but-unpublished card's photo only exists on the staging branch on
// GitHub — it isn't in the deployed site's static /photos/ output, which is
// baked from the live branch at the last build. Remote mode routes through
// /api/remote-photo (fetches the bytes straight from staging) instead of the
// plain static path, which would 404 for anything not yet published.
export function photoSrc(designId: string, fileName: string, remote: boolean): string {
  return remote
    ? `/api/remote-photo?designId=${encodeURIComponent(designId)}&fileName=${encodeURIComponent(fileName)}`
    : `/photos/${designId}/${fileName}`;
}
