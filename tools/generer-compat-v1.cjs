// Usage : node tools/generer-compat-v1.cjs <chemin de foundry2.css> scss/compat/_v1-foundry.scss
// (nécessite postcss : npm i --no-save postcss). À relancer si une version de Foundry change ses styles.
// Copie les règles de compatibilité V1 de Foundry (body.game .app …) vers le contenu des fenêtres V2 du système
const postcss = require('postcss');
const fs = require('fs');
const root = postcss.parse(fs.readFileSync(process.argv[2], 'utf8'));
const EXCLU = /sidebar|journal|#|chat|directory|compendium|hotbar|combat|playlist|scene|token|macro|tile|wall|ambient|permission|folder|filepicker|dice|settings|package|setup|player|notification|pause|hud|ruler|context-menu|av-|camera|roll-table|cards|tour|adventure|module|world|keybinding|controls|image-popout|theme-|window-header|window-title|resizable-handle|minimized|zhover|dialog-button|\.dialog\b/;
const CIBLE = ':is(.application.noc.sheet, .application.nocDialog)';
function convertir(sel) {
  const m = sel.match(/^(body\.game\s+)?(\.sheet\.app|\.app\.window-app|\.window-app\.app|\.app|\.window-app)(\S*)(?:\s+(.*))?$/);
  if (!m) return null;
  const [, , racine, suite, reste] = m;
  const app = racine === '.sheet.app' ? '.application.noc.sheet' : CIBLE;
  if (suite && !/^[:\[]/.test(suite)) return null;          // .app.autre-classe : autre application
  if (!reste && racine === '.window-app') return null;     // variables communes .window-app, .application
  if (!reste) return `body.game ${app}${suite}`;
  if (/^\.window-content\b/.test(reste)) return `body.game ${app}${suite} ${reste}`;
  if (/^form\b/.test(reste)) return `body.game :is(form.application.noc.sheet > .window-content, .application.nocDialog .window-content form)${reste.slice(4)}`;
  return `body.game ${app}${suite} .window-content ${reste}`;
}
const rules = [];
root.walkRules(r => {
  const layers = []; const media = [];
  for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule') { if (p.name === 'layer') layers.unshift(p.params); else media.unshift(`@${p.name} ${p.params}`); }
  const L = layers.join('/');
  if (!(L === 'variables.base' || L.startsWith('compatibility'))) return;
  const sels = r.selectors.filter(s => /(^|[\s>+~])(body\.game\s+)?\.(app|window-app)\b|\.sheet\.app/.test(s) && !EXCLU.test(s)).map(convertir).filter(Boolean);
  if (!sels.length) return;
  const decls = r.nodes.filter(n => n.type === 'decl').map(d => `  ${d.prop}: ${d.value.replace(/url\((["']?)\.\.\//g, 'url($1/')}${d.important ? ' !important' : ''};`).join('\n');
  if (!decls) return;
  let txt = `${sels.join(',\n')} {\n${decls}\n}`;
  for (const m of media.reverse()) txt = `${m} {\n${txt}\n}`;
  rules.push(txt);
});
const entete = `// Styles de compatibilité V1 de Foundry (couche « compatibility », sélecteurs body.game .app),
// recopiés pour le contenu des fiches et fenêtres ApplicationV2 du système : les styles de NOC ont été
// écrits par-dessus ceux-là. Fichier généré à partir de foundry2.css (Foundry v14) ; ne pas modifier à la main.
// Couche « system » de Foundry : au-dessus de ses règles d'applications V2, sous les styles du système.
`;
fs.writeFileSync(process.argv[3], entete + '@layer system {\n' + rules.join('\n') + '\n}\n');
console.log(rules.length, 'règles');
