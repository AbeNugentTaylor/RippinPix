import { notFound } from "next/navigation";
import ConfiguratorApp from "@/components/configurator/ConfiguratorApp";
import "./configurator.css";

export const metadata = {
  title: "Card configurator — RippinPix",
};

export default function ConfiguratorPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ConfiguratorApp />;
}
