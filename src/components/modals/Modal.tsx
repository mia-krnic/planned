import type { ReactNode } from 'react'

export default function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean // roomier shell for table-shaped content (the ICS import review)
}) {
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
