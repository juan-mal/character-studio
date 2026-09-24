export function NavigationHints() {
  return <span className="gesture-hint" aria-label="Navegación de la vista 3D">
    {([{part:'left',label:'Mover',help:'Arrastra con el botón izquierdo para mover la vista'},
      {part:'right',label:'Girar',help:'Arrastra con el botón derecho para girar'},
      {part:'wheel',label:'Zoom',help:'Usa la rueda para acercar o alejar'}] as const).map(item =>
      <span className="mouse-hint" key={item.part} title={item.help} aria-label={item.help}>
        <svg width="18" height="22" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="5" y="2" width="14" height="24" rx="7"/>
          {item.part === 'left' && <path d="M12 3v10H6V9a6 6 0 0 1 6-6Z" fill="currentColor" stroke="none"/>}
          {item.part === 'right' && <path d="M12 3v10h6V9a6 6 0 0 0-6-6Z" fill="currentColor" stroke="none"/>}
          <path d="M12 6v5" strokeWidth={item.part === 'wheel' ? 3 : 1.5} strokeLinecap="round"/>
        </svg>{item.label}
      </span>)}
  </span>;
}
