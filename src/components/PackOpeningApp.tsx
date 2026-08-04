"use client";

import { useEffect, useRef, useState } from "react";
import PackScene, { type PackSceneHandle } from "./PackScene";
import CollectionGrid, { type DealBatch } from "./CollectionGrid";
import CardLightbox from "./CardLightbox";
import { DESIGNS, PACKS, PER_PACK, plateAt } from "@/lib/designs";
import { configKey } from "@/lib/card-key";
import type { Card, CardConfig, Pack, Phase } from "@/lib/types";

const SHOP_NAME = "RippinPix";
const PACK_PRICE = "Free";
const TOTAL_PLATES = PACKS.length * PER_PACK;

interface PackOpeningAppProps {
  photoManifest: Record<string, string | null>;
  cardConfigs: Record<string, CardConfig>;
}

export default function PackOpeningApp({ photoManifest, cardConfigs }: PackOpeningAppProps) {
  const [phase, setPhase] = useState<Phase>("bin");
  const [cards, setCards] = useState<Card[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [currentPack, setCurrentPack] = useState<Pack | null>(null);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [dealBatch, setDealBatch] = useState<DealBatch | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const packSceneRef = useRef<PackSceneHandle | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => {
      mounted.current = false;
      mq.removeEventListener("change", handler);
    };
  }, []);

  const onPick = (pack: Pack) => {
    setCurrentPack(pack);
    setPhase("idle");
  };

  const onTearStart = () => setPhase("tearing");

  const onReady = () => setSceneReady(true);

  const onEnterBin = () => {
    setCurrentPack(null);
    setPhase("bin");
  };

  const onDeal = (pack: Pack, anchor: { x: number; y: number }) => {
    const orderNo = openedIds.length + 1;
    const fresh: Card[] = [];
    for (let i = 0; i < PER_PACK; i++) {
      const { plate, info } = plateAt(pack, i);
      const idx = plate - 1;
      const rare = i === PER_PACK - 1;
      const slot = `bin-${String(idx + 1).padStart(3, "0")}`;
      const local = i + 1; // 1-based local plate number within this pack's design
      const config = cardConfigs[configKey(pack.design.id, pack.from + local)];
      fresh.push({
        key: `${pack.id}-${i}`,
        order: -orderNo,
        designId: pack.design.id,
        slot,
        plate: String(idx + 1).padStart(3, "0"),
        tilt: ((idx * 37) % 5) - 2,
        tag: rare ? "#edbb00" : "#7de08a",
        tier: rare ? "Bent corner" : pack.design.name,
        ink: rare ? "var(--color-accent-2-700)" : pack.design.ink,
        title: config?.title ?? info.title,
        date: config?.date ?? info.date,
        medium: config?.medium ?? info.medium,
        photoUrl: photoManifest[slot] ?? null,
        rarity: config?.rarity,
        holo: config?.holo,
        attributes: config?.attributes,
        crop: config?.crop,
      });
    }
    setCards((prev) => [...prev, ...fresh]);
    setFilter("all");
    setPhase("dealing");
    setOpenedIds((prev) => [...prev, pack.id]);
    setDealBatch({ keys: fresh.map((c) => c.key), anchor, reducedMotion });
    const collectDelay = reducedMotion ? 400 : PER_PACK * 80 + 1000;
    setTimeout(() => {
      if (mounted.current) setPhase("collected");
    }, collectDelay);
  };

  const left = PACKS.length - openedIds.length;
  const binEmpty = left === 0;
  const binLabel = binEmpty
    ? "Bin's picked clean — you've seen every frame."
    : `${left} ${left === 1 ? "pack left" : "packs left"} · ${TOTAL_PLATES - cards.length} photographs still sealed`;
  const haulLabel = `${cards.length} of ${TOTAL_PLATES} photographs`;
  const countLabel = cards.length === 0 ? "Nothing pulled" : `${cards.length}/${TOTAL_PLATES} pulled`;
  const pulledLine = currentPack ? `Eight ${currentPack.design.name.toLowerCase()} in the bag.` : "";
  const binBlurb = `${PACKS.length} packs in there, ${TOTAL_PLATES} photographs total, every one in exactly one pack. Pull a pack out, rip it open. Empty the bin, you've seen the whole run.`;

  const inBin = phase === "bin";
  const isIdle = phase === "idle";
  const isCollected = phase === "collected";
  const canReturn = phase === "idle";
  const canReopen = phase === "collected" && left > 0;
  const hasCards = cards.length > 0;
  const isEmpty = cards.length === 0;

  const counts: Record<string, number> = {};
  cards.forEach((c) => {
    counts[c.designId] = (counts[c.designId] || 0) + 1;
  });
  const chipStyle = (active: boolean, tint: string) =>
    active
      ? { bg: tint, fg: "var(--color-text)" }
      : { bg: "transparent", fg: "var(--color-neutral-300)" };
  const filterList = [{ id: "all", label: `All ${cards.length}`, tint: "#7de08a" }]
    .concat(
      DESIGNS.filter((x) => counts[x.id]).map((x) => ({
        id: x.id,
        label: `${x.name} ${counts[x.id]}`,
        tint: x.stock,
      }))
    )
    .map((f, i) => ({
      id: f.id,
      label: f.label,
      tilt: ((i * 13) % 3) - 1,
      select: () => setFilter(f.id),
      ...chipStyle(filter === f.id, f.tint),
    }));

  const cardsForRender = cards.map((c) => ({
    ...c,
    display: (filter === "all" || c.designId === filter ? "block" : "none") as "block" | "none",
  }));

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-bar" />
        <div className="masthead-row">
          <span className="masthead-shop">{SHOP_NAME}</span>
          <span className="masthead-tagline">cash only · no refunds · no regrets</span>
          <span className="masthead-count">
            {countLabel}
            <span className="masthead-count-flake" />
          </span>
        </div>
        <div className="masthead-rule" />
      </header>

      <section className="headline">
        <div className="headline-copy">
          {inBin && (
            <>
              <h1 className="headline-h1">Dig through the bin.</h1>
              <p className="headline-blurb">{binBlurb}</p>
            </>
          )}
          {isIdle && <h1 className="headline-h1">Rip it open.</h1>}
          {isCollected && (
            <>
              <h1 className="headline-h1-small">{pulledLine}</h1>
              <span className="headline-sub">{binLabel}</span>
            </>
          )}
        </div>
        <div className="headline-price-col">
          <span className="headline-price">
            Everything {PACK_PRICE}
            <span className="headline-price-tag">yes really</span>
          </span>
          <span className="headline-bin-label">{binLabel}</span>
        </div>
      </section>

      <section className="stage-section">
        <PackScene
          ref={packSceneRef}
          phase={phase}
          reducedMotion={reducedMotion}
          shopName={SHOP_NAME}
          packPrice={PACK_PRICE}
          onPick={onPick}
          onTearStart={onTearStart}
          onDeal={onDeal}
          onEnterBin={onEnterBin}
          onReady={onReady}
        />
        <div className={`stage-loading${sceneReady ? " stage-loading-hidden" : ""}`} aria-hidden={sceneReady}>
          <span className="stage-loading-tag">Setting up the bin&hellip;</span>
        </div>
        {inBin && binEmpty && <span className="bin-empty-stamp">Bin&apos;s empty</span>}
      </section>

      <section className="action-row">
        <span className="action-label">Rather not dig:</span>
        <button
          className="action-btn action-btn-pink"
          onClick={() => packSceneRef.current?.pickRandom()}
          disabled={binEmpty}
        >
          Just grab me one
        </button>
        <span className="action-hint">or click any pack in the bin — they&apos;re all {PACK_PRICE}</span>
        {canReturn && (
          <button
            className="action-btn-outline"
            onClick={() => packSceneRef.current?.backToBin()}
          >
            Put it back
          </button>
        )}
        {canReopen && (
          <button
            className="action-btn action-btn-yellow"
            onClick={() => packSceneRef.current?.showBin()}
          >
            Back to the box
          </button>
        )}
        <span className="action-stamp">
          No refund on
          <br />
          merchandise
        </span>
      </section>

      <CollectionGrid
        shopName={SHOP_NAME}
        packPrice={PACK_PRICE}
        cards={cardsForRender}
        filterList={filterList}
        hasCards={hasCards}
        isEmpty={isEmpty}
        haulLabel={haulLabel}
        dealBatch={dealBatch}
        onSelectCard={setSelectedCard}
      />

      <CardLightbox card={selectedCard} onClose={() => setSelectedCard(null)} />

      <footer className="credits">
        Booster pack 3D model — &ldquo;Booster Pack (TCG Pack)&rdquo; by Hasan Ajami, via Sketchfab,
        licensed CC BY 4.0.
      </footer>
    </div>
  );
}
