export function nameTokens(displayName: string): string[] {
  return displayName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Chave "primeiro|ultimo" nome para o fallback de match por token (RN-17 passo 5). */
export function firstLastKey(displayName: string): string {
  const parts = nameTokens(displayName);

  if (parts.length < 2) {
    return parts[0] ?? "";
  }

  return `${parts[0]}|${parts[parts.length - 1]}`;
}

/** True quando o ultimo token do nome tem 1 letra (sobrenome truncado pela API). */
export function hasAbbreviatedLastName(displayName: string): boolean {
  const parts = nameTokens(displayName);
  return parts.length >= 2 && parts[parts.length - 1].length === 1;
}

/**
 * Chaves de sobrenome abreviado para um nome completo do torneio, da mais
 * especifica para a menos: "alex gomez berna" -> ["alexgomezb", "alexg"].
 * A API oficial Play! Pokémon trunca o sobrenome de muitos jogadores
 * ("Giuseppe M", "Francesco Pio P"); os standings trazem o nome completo.
 */
export function abbreviatedLastNameKeys(displayName: string): string[] {
  const parts = nameTokens(displayName);
  const keys: string[] = [];

  for (let cut = parts.length - 1; cut >= 1; cut -= 1) {
    keys.push(parts.slice(0, cut).join("") + parts[cut][0]);
  }

  return keys;
}

/**
 * Prefixos do nome em limites de token, do mais especifico para o menos,
 * sempre com pelo menos 2 tokens: "alex gomez berna" -> ["alexgomez"].
 * Cobre rankings que omitem o segundo sobrenome ("Álex Gomez").
 */
export function droppedSurnamePrefixes(displayName: string): string[] {
  const parts = nameTokens(displayName);
  const prefixes: string[] = [];

  for (let cut = parts.length - 1; cut >= 2; cut -= 1) {
    prefixes.push(parts.slice(0, cut).join(""));
  }

  return prefixes;
}
