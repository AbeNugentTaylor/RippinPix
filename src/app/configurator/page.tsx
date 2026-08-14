import { notFound } from "next/navigation";
import ConfiguratorApp from "@/components/configurator/ConfiguratorApp";
import { isRemoteBackend, isRemoteModeEnabled } from "@/lib/remote-mode.server";
import "./configurator.css";

export const metadata = {
  title: "Card configurator — RippinPix",
};

// Local dev: always enabled. Deployed: 404 unless CONFIGURATOR_REMOTE is
// explicitly opted in (see remote-mode.server.ts) — proxy.ts is the actual
// auth gate for the deployed case, this is just the "does the route exist
// at all" switch.
export default function ConfiguratorPage() {
  if (!isRemoteModeEnabled()) notFound();
  return <ConfiguratorApp remote={isRemoteBackend()} />;
}
