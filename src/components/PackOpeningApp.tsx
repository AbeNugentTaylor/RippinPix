"use client";

import { useEffect, useRef, useState } from "react";
import PackScene, { type PackSceneHandle } from "./PackScene";
import CollectionGrid, { type DealBatch } from "./CollectionGrid";
import { SERIES, getSeries } from "@/lib/series";
import type { Card, Phase, SeriesId } from "@/lib/types";

const CARDS_PER_PACK = 8;

interface PackOpeningAppProps {
  photoManifest: Record<string, string | null>;
}

export default function PackOpeningApp({ photoManifest }: PackOpeningAppProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [packNo, setPackNo] = useState(1);
  const [cards, setCards] = useState<Card[]>([]);
  const [seriesId, setSeriesId] = useState<SeriesId>(SERIES[0].id);
  const [filter, setFilter] = useState<string>("all");
  const [dealBatch, setDealBatch] = useState<DealBatch | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const packSceneRef = useRef<PackSceneHandle | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
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

  const series = getSeries(seriesId);

  const selectSeries = (id: SeriesId) => {
    if (phase !== "idle" || id === seriesId) return;
    setSeriesId(id);
  };

  const onProgress = (p: number) => {
    if (progressBarRef.current) progressBarRef.current.style.width = `${(p * 100).toFixed(1)}%`;
  };

  const onTearStart = () => setPhase("tearing");

  const onDeal = (anchor: { x: number; y: number }) => {
    setCards((prev) => {
      const drawn = prev.filter((c) => c.seriesId === series.id).length;
      const pool = series.pool;
      const fresh: Card[] = [];
      for (let i = 0; i < CARDS_PER_PACK; i++) {
        const idx = (drawn + i) % pool.length;
        const rare = i === CARDS_PER_PACK - 1;
        fresh.push({
          key: `${packNo}-${i}`,
          order: -packNo,
          seriesId: series.id,
          slot: `${series.id}-${idx}`,
          plate: String(idx + 1).padStart(2, "0"),
          tier: rare ? "Press proof" : series.name,
          ink: rare ? "var(--color-accent-2-700)" : series.ink,
          title: pool[idx].title,
          date: pool[idx].date,
          medium: pool[idx].medium,
          photoUrl: photoManifest[`${series.id}-${idx}`] ?? null,
        });
      }
      setDealBatch({ keys: fresh.map((c) => c.key), anchor, reducedMotion });
      return [...prev, ...fresh];
    });
    setFilter("all");
    setPhase("dealing");
    const collectDelay = reducedMotion ? 400 : CARDS_PER_PACK * 80 + 1000;
    setTimeout(() => {
      if (!mounted.current) return;
      setPhase("collected");
      packSceneRef.current?.restoreOpacity();
    }, collectDelay);
  };

  const openAnother = () => {
    packSceneRef.current?.openAnother();
    setPackNo((n) => n + 1);
    setPhase("idle");
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const counts: Record<string, number> = {};
  cards.forEach((c) => {
    counts[c.seriesId] = (counts[c.seriesId] || 0) + 1;
  });
  const chip = (active: boolean, tint: string) =>
    active
      ? { border: tint, bg: tint, fg: "#f8f4f4" }
      : { border: "var(--color-neutral-400)", bg: "transparent", fg: "var(--color-neutral-800)" };
  const filterList = [{ id: "all", label: `All ${cards.length}`, tint: "var(--color-neutral-800)" }]
    .concat(
      SERIES.filter((x) => counts[x.id]).map((x) => ({
        id: x.id,
        label: `${x.name} ${counts[x.id]}`,
        tint: x.dot,
      }))
    )
    .map((f) => ({ id: f.id, label: f.label, select: () => setFilter(f.id), ...chip(filter === f.id, f.tint) }));

  const packLabel = String(packNo).padStart(2, "0");
  const packsLabel =
    packNo === 1 && phase !== "collected"
      ? "Pack 01 sealed"
      : `${packNo} ${packNo === 1 ? "pack opened" : "packs opened"}`;
  const countLabel =
    cards.length === 0 ? "No cards yet" : `${cards.length} ${cards.length === 1 ? "card collected" : "cards collected"}`;
  const isIdle = phase === "idle";
  const isCollected = phase === "collected";
  const isEmpty = cards.length === 0;
  const hasCards = cards.length > 0;
  const cardsForRender = cards.map((c) => ({
    ...c,
    display: (filter === "all" || c.seriesId === filter ? "block" : "none") as "block" | "none",
  }));

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-rule-thick" />
        <div className="masthead-row">
          <span className="masthead-title">The Plate Series</span>
          <span className="masthead-sub">Sealed photographic art cards</span>
          <span className="masthead-count">{countLabel.toUpperCase()}</span>
        </div>
        <div className="masthead-rule-thin" />
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            Pack No. {packLabel} · {series.name}
          </span>
          <h1 className="hero-title">Tear the seal.</h1>
          <p className="hero-blurb">{series.blurb}</p>

          {isIdle && (
            <>
              <div className="chooser">
                <span className="chooser-label">Choose a pack</span>
                <div className="chooser-row">
                  {SERIES.map((s) => {
                    const active = s.id === series.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => selectSeries(s.id)}
                        className="chooser-btn"
                        style={{
                          borderColor: active ? s.dot : "var(--color-neutral-300)",
                          background: active ? "var(--color-neutral-200)" : "transparent",
                          color: active ? "var(--color-text)" : "var(--color-neutral-700)",
                        }}
                      >
                        <span className="chooser-dot" style={{ background: s.dot }} />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="swipe-hint-row">
                <span className="swipe-hint-text">Swipe right across the seal</span>
                <span className="swipe-hint-arrow" aria-hidden="true">
                  <svg width="34" height="12" viewBox="0 0 34 12" fill="none">
                    <path d="M0 6h30M25 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </span>
              </div>
              <span className="swipe-alt">Or tap the pack — keyboard: focus it and press Enter.</span>
            </>
          )}

          {isCollected && (
            <div className="opened-row">
              <span className="opened-label">
                Pack {packLabel} opened — {CARDS_PER_PACK} {series.name.toLowerCase()} cards pulled
              </span>
              <button className="btn btn-primary" onClick={openAnother}>
                Choose another pack
              </button>
            </div>
          )}
        </div>

        <div className="stage-wrap">
          <PackScene
            ref={packSceneRef}
            series={series}
            reducedMotion={reducedMotion}
            disabled={phase !== "idle"}
            onProgress={onProgress}
            onTearStart={onTearStart}
            onDeal={onDeal}
          />
          <div className="stage-progress">
            <div className="stage-progress-track">
              <div ref={progressBarRef} className="stage-progress-fill" />
            </div>
            <div className="stage-progress-labels">
              <span>Seal</span>
              <span>Torn</span>
            </div>
          </div>
        </div>
      </section>

      <CollectionGrid
        seriesTitle="The Plate Series"
        cards={cardsForRender}
        filterList={filterList}
        hasCards={hasCards}
        isEmpty={isEmpty}
        countLabel={countLabel}
        packsLabel={packsLabel}
        dealBatch={dealBatch}
      />

      <footer className="credits">
        Booster pack 3D model — &ldquo;Booster Pack (TCG Pack)&rdquo; by Hasan Ajami, via Sketchfab,
        licensed CC BY 4.0.
      </footer>
    </div>
  );
}
