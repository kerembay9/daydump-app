import type { Topic } from './topics';

const DAY = 86_400_000;
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Topic name without dates (the date range is on the meta line): "Coffee", "An autumn of cinnamon rolls". */
export function topicTitle(t: Pick<Topic, 'name' | 'start' | 'end'>): string {
  const spanDays = (t.end - t.start) / DAY;
  // vocab disambiguators go: "letter (message)" -> "letter"
  const name = (HUMAN[t.name] ?? t.name).replace(/\s*\(.*?\)/g, '').replace(/^(a|an) /, '');
  // a holiday or a season is its own time: "Canada day", not "An autumn of canada days"
  if (spanDays <= 21 || TIME.test(name)) return capitalize(name);
  const season = seasonOf((t.start + t.end) / 2);
  if (spanDays <= 120 && seasonOf(t.start) === seasonOf(t.end)) {
    if (name.startsWith('wearing ')) return capitalize(`${article(name.slice(8))} ${name.slice(8)} ${season}`); // "A red winter"
    return capitalize(`${article(season)} ${season} of ${plural(name)}`);
  }
  return capitalize(plural(name));
}

const TIME = /^(summer|winter|autumn|spring|spring break|christmas|easter|halloween|thanksgiving.*|new year.*|holy week|palm sunday|easter monday|.* eve|(?!beach day).* day)$/;

const same = (to: string, names: string) => Object.fromEntries(names.split('|').map((n) => [n, to]));
/** What people call a vocab tag (Open Images names are Wikipedia's): "drinking establishment" -> "bar". Titles only. */
const HUMAN: Record<string, string> = {
  'drinking establishment': 'bar', 'body of water': 'water views', 'human settlement': 'town', 'metropolitan area': 'city',
  'urban area': 'city streets', 'rural area': 'countryside', 'natural environment': 'nature', 'natural landscape': 'landscape',
  'natural satellite': 'moon', 'natural food': 'whole food', 'plant community': 'greenery', 'atmosphere of earth': 'sky',
  'outdoor play equipment': 'playground', 'party supply': 'party decoration', 'party favor': 'party decoration',
  'wedding ceremony supply': 'wedding detail', 'ski equipment': 'ski gear', 'competition event': 'competition',
  'off-road vehicle': '4x4', 'sport utility vehicle': 'SUV', 'water transportation': 'boat', 'motor launch': 'motorboat',
  'dairy product': 'dairy', 'display window': 'shop window', 'academic institution': 'campus', 'academic dress': 'graduation gown',
  phd: 'graduation', 'fitness and figure competition': 'fitness competition', 'indoor games and sports': 'indoor game',
  'work of art': 'artwork', 'take-out food': 'takeout', 'convenience food': 'snack', 'photograph album': 'photo album',
  'stock photography': 'photography', 'visual effect lighting': 'light show', 'landscape lighting': 'garden light',
  'construction set toy': 'building blocks', 'everyday carry': 'pocket essentials', 'health & beauty': 'beauty',
  'rain and snow mixed': 'sleet', 'san storm': 'sandstorm', 'water feature': 'fountain', 'water organ': 'fountain',
  'function hall': 'event hall', 'movie palace': 'cinema', 'tour bus service': 'tour bus', 'ms island escape': 'cruise ship',
  'ship of the line': 'tall ship', 'railroad car': 'train', 'aircraft cabin': 'plane cabin', airline: 'flight',
  'travel trailer': 'camper', 'official residence': 'palace', 'presidential palace': 'palace', 'listed building': 'historic building',
  'historic house': 'historic building', 'garden buildings': 'garden shed', 'old man of the mountain': 'mountain',
  'hill station': 'hill town', 'singing sand': 'dune', 'wind wave': 'wave', rapid: 'rapids', fell: 'hill',
  'spanish missions in california': 'mission church', 'times square ball': "new year's eve", 'soup number five': 'soup',
  'eagle rare': 'bourbon', 'victoria bitter': 'beer', 'red horse beer': 'beer', 'southern comfort': 'whiskey',
  'cream (drink)': 'cream liqueur', 'rose (drink)': 'rosé', 'drill (animal)': 'monkey', 'african grey': 'parrot',
  'river monitor': 'lizard', 'domestic pig': 'pig', 'jersey cattle': 'cow', 'wild water buffalo': 'water buffalo',
  'ultimate': 'frisbee', 'flying disc': 'frisbee', 'disc dog': 'frisbee dog', 'over-the-line': 'ball game', 'four square': 'playground game',
  'running back': 'football', defender: 'football', 'power move': 'breakdancing', 'b-boy': 'breakdancing', 'basic pump': 'high heel',
  'a-line': 'dress', 'day dress': 'dress', 'dress suit': 'suit', 'morning dress': 'suit', 'dress code': 'outfit', 'kelly bag': 'handbag',
  overall: 'overalls', 'board short': 'board shorts', 'jean short': 'jean shorts', 'high-top': 'high-tops', 'bond bug': 'tiny car',
  'ford custom': 'classic car', 'personal luxury car': 'luxury car', 'executive car': 'luxury car', 'luxury vehicle': 'luxury car',
  'light aircraft': 'small plane', 'general aviation': 'small plane', 'wide-body aircraft': 'plane', 'jet aircraft': 'plane', aircraft: 'plane',
  'religious institute': 'sacred place', 'holy places': 'sacred place', 'place of worship': 'sacred place', 'deck (building)': 'deck',
  'theater (building)': 'theater', 'pattern (fashion design)': 'pattern', 'self heal': 'wildflower', 'pine': 'pine tree',
  ...same('vintage car', 'austin ambassador|austin atlantic|austin cambridge|ford model b|ford model f|ford model n|ford model t|ford model y|morris minor'),
  ...same('cocktail', 'aviation (drink)|earthquake (drink)|club (drink)'),
  ...same('activewear', 'active pants|active shirt|active shorts|active tank'),
  ...same('self-care', 'hair care|skin care|nail care'),
  ...same('horse riding', 'english pleasure|western pleasure|hunt seat|english riding|western riding|trail riding|competitive trail riding'),
  ...same('cricket match', 'first-class cricket|one day international|test cricket'),
  ...same('golf', 'match play|speed golf'),
  ...same('football', 'direct free kick|penalty kick|soccer kick|kick (sports)'),
  ...same('ball game', 'stick and ball games|stick and ball sports|bat-and-ball games'),
  ...same('water sport', 'water & ball sports|surface water sports'),
  ...same('dog', 'dog breed|dog breed group|sporting group|non-sporting group|northern breed group|companion dog|working dog|toy dog|carolina dog|chinese imperial dog|moscow water dog|native american indian dog|polish hunting dog|small greek domestic dog|spanish water dog|greater swiss mountain dog|australian cattle dog'),
  ...same('cat', 'asian golden cat|dragon li|turkish van|russian blue|tom cat'),
  ...same('animal', 'working animal|pack animal'),
  ...same('monkey', 'new world monkey|old world monkey'),
  ...same('bear', 'american black bear|asian black bear|sun bear'),
  ...same('fox', 'silver fox|swift fox|kit fox|grey fox'),
  ...same('duck', 'american black duck|wood duck'),
  ...same('swallow', 'purple martin|sand martin'),
  ...same('robin', 'american robin|european robin'),
  ...same('fish', 'rock beauty|sole (fish)|bass (fish)|spanish fish|deep sea fish'),
  ...same('butterfly', 'eastern bath white|bath white|great southern white|garden white|west coast lady|american painted lady|common blue|small blue|large blue|large copper|blue copper'),
  ...same('oak', 'california black oak|california live oak|southern live oak|northern red oak|post oak|black oak'),
  ...same('pine tree', 'jack pine|red pine|sugar pine|stone pine|pine family'),
  ...same('rose', 'california wild rose|carolina rose|china rose|jack rose|lady banks\' rose|julia child rose|virginia rose|white mexican rose|woods\' rose|rock rose|rose family|rose order'),
  ...same('cherry', 'black cherry|fire cherry|spanish cherry|sweet cherry'),
  ...same('plant', 'land plant|annual plant'),
  ...same('flower', 'pride of india|evening stock|baby blue eyes|globe flower|cape flower|spider flowers|glory of the snow|indian blanket|sweet william|three sisters|crown imperial|golden chain tree|franklin tree|pink family|passion flower family|morning glory family'),
  ...same('plane tree', 'plane trees|plane-tree family'),
  ...same('beach', 'beach ridge|raised beach'),
  ...same('island', 'river island|artificial island'),
};

// irregular plurals and mass nouns among the vocab's last words: "woman" -> "women", "street food" stays
const IRREGULAR: Record<string, string> = {
  man: 'men', woman: 'women', gentleman: 'gentlemen', child: 'children', person: 'people', foot: 'feet', tooth: 'teeth',
  mouse: 'mice', knife: 'knives', leaf: 'leaves', wolf: 'wolves', shelf: 'shelves', life: 'lives', potato: 'potatoes', hero: 'heroes',
};
const UNCOUNTABLE = new Set(
  ('fish sheep deer salmon cattle aircraft sushi food art music coffee tea rice milk water juice bread wine beer candy grain ' +
    'equipment furniture clothing jewelry hair grass sand ice snow rain fog money traffic wildlife police nature travel tourism ' +
    'architecture history photography fashion design agriculture aviation beauty comfort love peace romance energy entertainment ' +
    'recreation weather wind thunder lightning smoke fire sun chocolate cream honey bacon beef pork meat chicken corn alcohol dairy ' +
    'produce gear football soccer rugby tennis golf hockey baseball basketball cricket yoga volleyball jazz countryside greenery ' +
    'sleet takeout care silk fur gold silver brass clay paint exercise').split(' '),
);
// -ing words are activities ("A summer of cycling"), but these are things
const COUNTABLE_ING = new Set('building painting drawing wedding ring wing earring dumpling string swing'.split(' '));

export function plural(w: string): string {
  const last = w.match(/[^\s-]+$/)?.[0] ?? '';
  if (IRREGULAR[last]) return w.slice(0, -last.length) + IRREGULAR[last];
  if (UNCOUNTABLE.has(last) || /^wearing |colors$|s$|wear$/.test(w) || (/ing$/.test(last) && !COUNTABLE_ING.has(last))) return w;
  if (/(sh|ch|x)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

export function seasonOf(t: number): string {
  return ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date(t).getMonth()];
}

export function fmtDay(t: number) {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Photo date range for meta lines (local days): "May 18", "May 12–18", "May 28–Jun 2", "Sep–Nov"; the year only when
 * it isn't this year ("May 12–18, 2024", "Sep–Nov 2024"); "Dec 2024–Mar 2025" across years; "2023–2025" past 12 months.
 */
export function dateRange(a: number, b: number, now = Date.now()): string {
  const A = new Date(Math.min(a, b)), B = new Date(Math.max(a, b));
  const [ya, yb] = [A.getFullYear(), B.getFullYear()];
  const [ma, mb] = [MONTHS[A.getMonth()], MONTHS[B.getMonth()]];
  const span = (B.getTime() - A.getTime()) / DAY;
  const yr = yb !== new Date(now).getFullYear() ? yb : null;
  if (span > 365) return `${ya}–${yb}`;
  if (span > 45) return ya !== yb ? `${ma} ${ya}–${mb} ${yb}` : `${ma}–${mb}${yr ? ` ${yr}` : ''}`;
  const y = yr ? `, ${yr}` : '';
  if (A.toDateString() === B.toDateString()) return `${fmtDay(A.getTime())}${y}`;
  if (ma === mb && ya === yb) return `${ma} ${A.getDate()}–${B.getDate()}${y}`;
  return `${fmtDay(A.getTime())}–${fmtDay(B.getTime())}${y}`;
}

/**
 * Same title twice in the list ("Coffee", "Coffee") -> add the first of year / season / month / date range that tells the
 * group apart, never this year (the meta line has the dates): "Coffee" / "Coffee, 2024"; "Coffee in spring" / "Coffee in autumn".
 */
export function disambiguate<T extends { title: string; start: number; end: number }>(items: T[], now = Date.now()): T[] {
  const groups = new Map<string, T[]>();
  for (const s of items) (groups.get(s.title) ?? groups.set(s.title, []).get(s.title)!).push(s);
  const mid = (s: T) => new Date((s.start + s.end) / 2);
  const yr = (s: T) => (mid(s).getFullYear() === new Date(now).getFullYear() ? '' : ` ${mid(s).getFullYear()}`);
  const suffixes = [
    (s: T) => (yr(s) ? `,${yr(s)}` : ''),
    (s: T) => ` in ${seasonOf(mid(s).getTime())}${yr(s)}`,
    (s: T) => ` in ${MONTH_NAMES[mid(s).getMonth()]}${yr(s)}`,
    (s: T) => `, ${dateRange(s.start, s.end, now)}`,
  ];
  const renamed = new Map<T, string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const f = suffixes.find((fn) => new Set(g.map(fn)).size === g.length) ?? suffixes[3];
    g.forEach((s) => renamed.set(s, `${s.title}${f(s)}`));
  }
  return items.map((s) => (renamed.has(s) ? { ...s, title: renamed.get(s)! } : s));
}

const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
