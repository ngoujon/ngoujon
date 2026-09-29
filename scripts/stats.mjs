// Génère assets/stats.svg : 4 KPI essentiels du profil, en thème clair et sombre.
// Usage : GITHUB_TOKEN=... node scripts/stats.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = "ngoujon";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN manquant");

const query = `{
  user(login: "${LOGIN}") {
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
      nodes { languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const { data, errors } = await res.json();
if (errors) throw new Error(JSON.stringify(errors));
const { user } = data;

// Contributions et série en cours
const calendar = user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((w) => w.contributionDays);
const activeDays = days.filter((d) => d.contributionCount > 0).length;
let streak = 0;
// Aujourd'hui peut encore être vide : on ne casse la série qu'à partir d'hier.
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else if (i !== days.length - 1) break;
}

// Langage principal, pondéré par le volume de code
const langs = {};
for (const repo of user.repositories.nodes)
  for (const { size, node } of repo.languages.edges) {
    langs[node.name] ??= { size: 0, color: node.color };
    langs[node.name].size += size;
  }
const totalSize = Object.values(langs).reduce((a, l) => a + l.size, 0);
const [topName, top] = Object.entries(langs).sort((a, b) => b[1].size - a[1].size)[0];
const topShare = Math.round((top.size / totalSize) * 100);

const fmt = (n) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
const kpis = [
  { value: fmt(calendar.totalContributions), label: "contributions", sub: "sur 12 mois" },
  { value: `${streak} j`, label: "série en cours", sub: "jours d'affilée" },
  { value: fmt(activeDays), label: "jours actifs", sub: "sur 12 mois" },
  { value: topName, label: "langage principal", sub: `${topShare} % du code`, dot: top.color },
];

const W = 860, H = 120, GAP = 12, TILE = (W - GAP * 3) / 4;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tiles = kpis
  .map((k, i) => {
    const x = i * (TILE + GAP);
    const cx = x + TILE / 2;
    return `<g>
    <rect class="tile" x="${x + 0.5}" y="0.5" width="${TILE - 1}" height="${H - 1}" rx="12" />
    <text class="value" x="${cx}" y="52" text-anchor="middle">${esc(k.value)}</text>
    <text class="label" x="${cx}" y="78" text-anchor="middle">${esc(k.label)}</text>
    <text class="sub" x="${cx}" y="98" text-anchor="middle">${k.dot ? `<tspan fill="${k.dot}">● </tspan>` : ""}${esc(k.sub)}</text>
  </g>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${kpis.map((k) => `${k.value} ${k.label}`).join(", ")}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .tile { fill: #f6f8fa; stroke: #d0d7de; }
    .value { font-size: 30px; font-weight: 700; fill: #1f2328; }
    .label { font-size: 14px; font-weight: 600; fill: #1f2328; }
    .sub { font-size: 12px; fill: #656d76; }
    @media (prefers-color-scheme: dark) {
      .tile { fill: #161b22; stroke: #30363d; }
      .value, .label { fill: #e6edf3; }
      .sub { fill: #8d96a0; }
    }
  </style>
  ${tiles}
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", svg);
console.log(kpis.map((k) => `${k.label}: ${k.value} (${k.sub})`).join("\n"));
