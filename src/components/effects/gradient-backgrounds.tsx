import { cn } from "@/lib/utils";

export const GradientBackgrounds = () => {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(135% 135% at 50% 10%, #ffffff 30%, #e0e7ff 65%, #6366f1 100%)",
        }}
      />
    </div>
  );
};

