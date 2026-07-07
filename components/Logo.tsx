import Image from "next/image";

export function Logo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.webp"
      alt="FrameCity"
      width={1078}
      height={435}
      priority={priority}
      className={`w-auto ${className}`}
    />
  );
}
