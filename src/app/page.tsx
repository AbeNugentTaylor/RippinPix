import PackOpeningApp from "@/components/PackOpeningApp";
import { getPhotoManifest } from "@/lib/photos.server";
import { getCardConfigs } from "@/lib/card-configs.server";

export default function Home() {
  const photoManifest = getPhotoManifest();
  const cardConfigs = getCardConfigs();
  return <PackOpeningApp photoManifest={photoManifest} cardConfigs={cardConfigs} />;
}
