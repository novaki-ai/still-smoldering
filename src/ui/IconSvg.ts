export function getUpgradeIconSvg(id: string, color: string): string {
  switch (id) {
    case 'wpn_match_spark':
    case 'evo_inferno_gatling':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="15" fill="${color}22" stroke="${color}" stroke-width="2"/>
        <path d="M18 6C21 12 26 14 25 21C24 26 20 29 16 29C12 29 10 25 11 20C12 16 16 12 18 6Z" fill="${color}"/>
        <circle cx="18" cy="22" r="4" fill="#fff7ed"/>
      </svg>`;
    case 'wpn_flame_whip':
    case 'evo_solar_scourge':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="15" fill="${color}22" stroke="${color}" stroke-width="2"/>
        <path d="M8 26C12 14 20 10 28 12C22 16 18 22 14 28" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
        <path d="M10 18C16 10 24 8 29 16" stroke="#fef08a" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    case 'wpn_orbit_embers':
    case 'evo_supernova_ring':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="11" stroke="${color}" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="18" cy="7" r="4.5" fill="${color}"/>
        <circle cx="28" cy="23" r="4.5" fill="${color}"/>
        <circle cx="8" cy="23" r="4.5" fill="${color}"/>
        <circle cx="18" cy="18" r="3.5" fill="#fff7ed"/>
      </svg>`;
    case 'wpn_strike_boomerang':
    case 'evo_guillotine_saw':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="18,4 22,13 32,14 24,21 26,31 18,25 10,31 12,21 4,14 14,13" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
        <circle cx="18" cy="18" r="4.5" fill="#0f172a"/>
      </svg>`;
    case 'wpn_molotov_pitch':
    case 'evo_hellfire_cataclysm':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="15" y="7" width="6" height="6" rx="1" fill="#94a3b8"/>
        <path d="M12 16C12 13 15 13 15 13H21C21 13 24 13 24 16V26C24 28 22 29 18 29C14 29 12 28 12 26V16Z" fill="${color}"/>
        <path d="M18 3C20 5 22 6 19 9" stroke="#fef08a" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case 'wpn_flare_beam':
    case 'evo_prism_obliterator':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="6" y1="30" x2="30" y2="6" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
        <line x1="6" y1="30" x2="30" y2="6" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;
    case 'wpn_smoke_lightning':
    case 'evo_thunderhead_storm':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,4 9,20 17,20 15,32 27,15 19,15" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
      </svg>`;
    case 'wpn_ash_nova':
    case 'evo_grand_finale':
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="6" fill="${color}"/>
        <path d="M18 4V10M18 26V32M4 18H10M26 18H32M8 8L13 13M23 23L28 28M28 8L23 13M13 23L8 28" stroke="${color}" stroke-width="2.8" stroke-linecap="round"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="24" height="24" rx="6" fill="${color}33" stroke="${color}" stroke-width="2.5"/>
        <circle cx="18" cy="18" r="6" fill="${color}"/>
        <path d="M18 9V27M9 18H27" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }
}
