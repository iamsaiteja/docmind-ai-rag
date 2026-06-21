import Particles from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { useCallback } from "react";

export default function ParticlesBg() {

  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  return (
    <Particles
      id="particles"
      init={particlesInit}
      options={{
        fpsLimit: 60,

        particles: {
          number: {
            value: 80,
          },

          color: {
            value: "#6366f1",
          },

          links: {
            enable: true,
            color: "#6366f1",
            distance: 150,
            opacity: 0.2,
          },

          move: {
            enable: true,
            speed: 1,
          },

          size: {
            value: 2,
          },

          opacity: {
            value: 0.5,
          },
        },
      }}
      className="fixed inset-0 z-0"
    />
  );
}