import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import gsap from "gsap";

interface SpatialPanelProps {
  children: React.ReactNode;
  className?: string;
  depth?: number;
}

export const SpatialPanel = ({ children, className, depth = 100 }: SpatialPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;

    // LUXURY ANIMATION: Entrance along the Z-axis with blur decay
    gsap.fromTo(panelRef.current,
      {
        z: -depth,
        opacity: 0,
        filter: "blur(20px)"
      },
      {
        z: 0,
        opacity: 1,
        filter: "blur(0px)",
        duration: 1.4,
        ease: "expo.out",
        delay: 0.2
      }
    );
  }, [depth]);

  return (
    <div
      ref={panelRef}
      className={cn("spatial-stage relative perspective-1000", className)}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="glass-panel transform-gpu transition-transform hover:translateZ(20px)">
        {children}
      </div>
    </div>
  );
};