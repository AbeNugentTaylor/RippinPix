import PackOpeningApp from "@/components/PackOpeningApp";
import { getPhotoManifest } from "@/lib/photos.server";

export default function Home() {
  const photoManifest = getPhotoManifest();
  return <PackOpeningApp photoManifest={photoManifest} />;
}
