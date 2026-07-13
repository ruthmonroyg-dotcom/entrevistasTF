const BASE_HEIGHT = 32

const LOGOS = [
  { src: '/logos/iatf.jpg', alt: 'Instituto Atlántico de Terapia Familiar', height: BASE_HEIGHT * 1.2 * 1.4 },
  { src: '/logos/ucab.png', alt: 'Universidad Católica Andrés Bello', height: BASE_HEIGHT },
  { src: '/logos/invedin.png', alt: 'INVEDIN', height: BASE_HEIGHT * 0.95 },
]

export default function LogosHeader() {
  return (
    <div className="logos-header">
      {LOGOS.map((logo, i) => (
        <img
          key={logo.src}
          src={logo.src}
          alt={logo.alt}
          style={{ height: `${logo.height}px`, ...(i > 0 ? { marginLeft: '2cm' } : {}) }}
        />
      ))}
    </div>
  )
}
