// Ícones vetoriais locais: sem fontes, bibliotecas ou requisições externas.
const paths = {
 home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
 ministry:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"/>',
 groups:'<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M12 8v4M5 15v-3h14v3"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
 heart:'<path d="M20.8 5.6a5.3 5.3 0 0 0-7.5 0L12 7l-1.3-1.4a5.3 5.3 0 0 0-7.5 7.5L12 22l8.8-8.9a5.3 5.3 0 0 0 0-7.5Z"/>',
 report:'<path d="M14 3H5v18h14V8Z M14 3v5h5M8 17v-3m4 3v-6m4 6v-4"/>',
 settings:'<path d="m9 3-1 3-3 1 1 4-2 2 2 3 3-1 2 3h3l1-3 3-1-1-4 2-2-2-3-3 1-2-3Z"/><circle cx="11.5" cy="10.5" r="3"/>',
 logout:'<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h13"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 circle:'<circle cx="12" cy="12" r="8"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 view:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 edit:'<path d="m15 5 4 4M4 16v4h4L20 8a3 3 0 0 0-4-4Z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
};
export function adminIcon(name) {
 return '<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name] || paths.groups)+'</svg>';
}
export function glyphIcon(glyph) {
 return adminIcon(({'♙':'users','♧':'groups','▦':'calendar','▤':'report','♡':'heart','✓':'check','○':'circle','▣':'ministry','♫':'groups'})[glyph] || 'groups');
}
