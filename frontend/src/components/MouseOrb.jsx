import React, { useEffect, useRef, useState } from "react";

export default function MouseOrb() {
  const orbRef = useRef(null);
  const [ripples, setRipples] = useState([]);

  useEffect(() => {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x, ty = y;
    let hue = 200;
    let raf;
    let lastMove = Date.now();

    const handleMove = (e) => {
      tx = e.clientX;
      ty = e.clientY;
      lastMove = Date.now();
    };

    const handleClick = (e) => {
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY, hue }]);
      setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 900);
    };

    const animate = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;

      // Shift hue based on movement
      const moving = Date.now() - lastMove < 100;
      hue = (hue + (moving ? 2.5 : 0.4)) % 360;

      if (orbRef.current) {
        const c1 = `hsla(${hue}, 95%, 75%, .9)`;
        const c2 = `hsla(${(hue + 60) % 360}, 90%, 65%, .55)`;
        const c3 = `hsla(${(hue + 120) % 360}, 85%, 55%, .25)`;
        orbRef.current.style.transform = `translate(${x - 14}px, ${y - 14}px)`;
        orbRef.current.style.background =
          `radial-gradient(circle at 35% 30%, rgba(255,255,255,.95) 0%, ${c1} 25%, ${c2} 55%, ${c3} 80%, transparent 100%)`;
        orbRef.current.style.boxShadow =
          `0 0 22px ${c1}, 0 0 40px ${c2}, inset 0 -2px 4px rgba(255,255,255,.4), inset 0 2px 3px rgba(255,255,255,.4)`;
      }
      raf = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mousedown", handleClick);
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mousedown", handleClick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div
        ref={orbRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999]"
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          mixBlendMode: "screen",
          willChange: "transform, background",
        }}
      />
      {ripples.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none fixed top-0 left-0 z-[9998]"
          style={{
            left: r.x - 20,
            top: r.y - 20,
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: `2px solid hsla(${r.hue}, 90%, 70%, .7)`,
            animation: "ripple-spread 0.9s ease-out forwards",
            mixBlendMode: "screen",
          }}
        />
      ))}
    </>
  );
}