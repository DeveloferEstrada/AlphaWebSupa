import Image from 'next/image'

export default function Loader({ size = 40 }: { size?: number }) {
  return (
    <Image
      src="/brand/loader.gif"
      alt="Cargando..."
      width={size}
      height={size}
      unoptimized
    />
  )
}
