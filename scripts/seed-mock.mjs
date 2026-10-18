// Seeds the local D1 database with mock collections whose Story and Gallery are
// already written, so the views can be designed and debugged without OPENAI_API_KEY.
// Every mock document passes the same validateSession() contract as model output.
//
//   node scripts/seed-mock.mjs          # replace all mock rows
//   node scripts/seed-mock.mjs --clear  # remove mock rows only
//
// Requires `npm run build` once (for dist/server/wrangler.json). Rows use the
// local development identity and ids starting with "mock-".
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSession } from "../lib/story.mjs";

const OWNER = "local_seedy";
const CONFIG = "dist/server/wrangler.json";
const clearOnly = process.argv.includes("--clear");

const pic = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const at = (minutes) =>
  new Date(Date.UTC(2026, 9, 17, 9, 0) + minutes * 60000).toISOString();

// ---------- 1. Full session: 5 steps, 6 nodes, pictures, a font specimen ----------
const portfolio = {
  id: "mock-c-portfolio",
  name: "Portfolio redesign",
  provider: "Claude Code",
  turns: [
    [
      "user",
      "I want my portfolio to feel like a quiet print catalogue, not a SaaS landing page. Here are two directions I sketched: a dense grid and a single column with big images.",
    ],
    [
      "assistant",
      "Both work. The dense grid shows more work at once; the single column gives each project room. Which feels closer to the catalogue idea?",
    ],
    [
      "user",
      "Go with the single column. The grid felt like a stock photo site. Every project gets one big image and one sentence.",
    ],
    [
      "assistant",
      "Done. Each project is now a full-width image followed by a single caption line.",
    ],
    [
      "user",
      "Use https://www.are.na/ as the bar for tone. I like how the blocks never shout, everything is grey and the content brings the colour.",
    ],
    [
      "user",
      "And look at https://rsms.me/inter/ for type. Set the headlines in Inter Display at 56 px, tight tracking. The homepage headline is Quiet things, made carefully.",
    ],
    [
      "assistant",
      "Headlines now use Inter Display at 56 px with -0.02em tracking.",
    ],
    [
      "user",
      "Here is my pencil sketch of the project page. Build it from this: image left, notes in a narrow column on the right.",
    ],
    [
      "assistant",
      "Built the project page from the sketch with a 7/5 split and the notes column fixed at 320 px.",
    ],
    [
      "user",
      "Tried the parallax hero you suggested. It makes me seasick. Drop it and keep the static hero.",
    ],
    [
      "user",
      "Rule for the whole site: one accent colour, #3B5BDB, only on links. Nothing else gets colour.",
    ],
    ["user", "Motion should be 200 ms ease-out everywhere. Nothing bounces."],
    [
      "assistant",
      "Applied a single 200 ms ease-out transition token and removed the spring animations.",
    ],
  ],
  items: [
    {
      key: "grid",
      kind: "image",
      title: "Dense grid sketch",
      image: pic("cp-grid", 1200, 900),
      context:
        "Two directions I sketched: a dense grid and a single column with big images.",
    },
    {
      key: "column",
      kind: "image",
      title: "Single column sketch",
      image: pic("cp-column", 800, 1200),
      context:
        "Go with the single column. Every project gets one big image and one sentence.",
    },
    {
      key: "arena",
      kind: "link",
      title: "Are.na",
      url: "https://www.are.na/",
      context: "Use https://www.are.na/ as the bar for tone.",
    },
    {
      key: "inter",
      kind: "link",
      title: "Inter typeface",
      url: "https://rsms.me/inter/",
      context: "Look at https://rsms.me/inter/ for type.",
    },
    {
      key: "pencil",
      kind: "image",
      title: "Project page pencil sketch",
      image: pic("cp-pencil", 900, 1200),
      context:
        "My pencil sketch of the project page: image left, notes in a narrow column on the right.",
    },
    {
      key: "built",
      kind: "image",
      title: "Built project page",
      image: pic("cp-built", 1440, 900),
      context: "Built the project page from the sketch with a 7/5 split.",
    },
    {
      key: "parallax",
      kind: "image",
      title: "Parallax hero attempt",
      image: pic("cp-parallax", 1600, 800),
      context: "Tried the parallax hero. It makes me seasick.",
    },
    {
      key: "hero",
      kind: "image",
      title: "Static hero",
      image: pic("cp-hero", 1600, 900),
      context: "Keep the static hero.",
    },
    // A canvas uses each item once, so the kept hero is its own capture.
    {
      key: "heroFinal",
      kind: "image",
      title: "Static hero, final",
      image: pic("cp-hero-final", 1600, 900),
      context: "Keep the static hero.",
    },
  ],
  session: ({ t, i }) => ({
    steps: [
      {
        title: "One column, not a grid",
        text: "I sketched a dense grid and a single column. The grid felt like a stock photo site, so I went with the column: every project gets one big image and one sentence.",
        canvas: {
          layout: "choice",
          items: [
            { itemId: i.grid, role: "option", label: "Dense grid" },
            { itemId: i.column, role: "picked", label: "Single column" },
          ],
          quote: null,
        },
        evidence: [
          { sourceId: t[2], quote: "The grid felt like a stock photo site." },
        ],
      },
      {
        title: "Are.na sets the tone",
        text: "I used Are.na as the bar. The blocks never shout, everything is grey and the content brings the colour. That is how I want the portfolio to feel.",
        canvas: {
          layout: "reference",
          items: [{ itemId: i.arena, role: "reference", label: "Are.na" }],
          quote: null,
        },
        evidence: [
          {
            sourceId: t[4],
            quote:
              "I like how the blocks never shout, everything is grey and the content brings the colour.",
          },
        ],
      },
      {
        title: "Built from my pencil sketch",
        text: "I drew the project page by hand first: image left, notes in a narrow column on the right. The build follows it with a 7/5 split and a 320 px notes column.",
        canvas: {
          layout: "before-after",
          items: [
            { itemId: i.pencil, role: "before", label: "Pencil sketch" },
            { itemId: i.built, role: "after", label: "Project page" },
          ],
          quote: null,
        },
        evidence: [
          {
            sourceId: t[7],
            quote: "image left, notes in a narrow column on the right",
          },
          {
            sourceId: t[8],
            quote: "Built the project page from the sketch with a 7/5 split",
          },
        ],
      },
      {
        title: "Dropped the parallax hero",
        text: "The parallax hero made me seasick, so I dropped it. The static hero stays, which also keeps the first screen calm like the rest of the site.",
        canvas: {
          layout: "detour",
          items: [
            { itemId: i.hero, role: "start", label: "Static hero" },
            { itemId: i.parallax, role: "attempt", label: "Parallax hero" },
            { itemId: i.heroFinal, role: "result", label: "Static hero kept" },
          ],
          quote: null,
        },
        evidence: [
          {
            sourceId: t[9],
            quote: "It makes me seasick. Drop it and keep the static hero.",
          },
        ],
      },
      {
        title: "Colour only on links",
        text: "I set one rule for the whole site. A single accent colour, used only on links, and nothing else gets colour. Motion stays plain too.",
        canvas: {
          layout: "quote",
          items: [],
          quote: {
            sourceId: t[11],
            text: "Motion should be 200 ms ease-out everywhere. Nothing bounces.",
          },
        },
        evidence: [
          {
            sourceId: t[10],
            quote: "one accent colour, #3B5BDB, only on links",
          },
        ],
      },
    ],
    map: {
      center: {
        label: "Quiet print-catalogue portfolio",
        itemId: i.built,
        url: null,
      },
      nodes: [
        {
          label: "Single column",
          kind: "look",
          weight: "major",
          summary: "One big image and one sentence per project",
          font: null,
          itemId: i.column,
          url: null,
          evidence: {
            sourceId: t[2],
            quote: "Every project gets one big image and one sentence.",
          },
          details: [
            {
              label: "Dense grid ruled out",
              itemId: i.grid,
              url: null,
              evidence: {
                sourceId: t[2],
                quote: "The grid felt like a stock photo site.",
              },
            },
          ],
        },
        {
          label: "Inter Display",
          kind: "look",
          weight: "major",
          summary: "Headlines at 56 px with tight tracking",
          font: {
            family: "Inter Display",
            sample: "Quiet things, made carefully.",
          },
          itemId: null,
          url: null,
          evidence: {
            sourceId: t[5],
            quote:
              "Set the headlines in Inter Display at 56 px, tight tracking.",
          },
          details: [
            {
              label: "Inter typeface",
              itemId: i.inter,
              url: "https://rsms.me/inter/",
              evidence: {
                sourceId: t[5],
                quote: "look at https://rsms.me/inter/ for type",
              },
            },
          ],
        },
        {
          label: "Are.na",
          kind: "reference",
          weight: "normal",
          summary: "Grey blocks that let the content bring colour",
          font: null,
          itemId: i.arena,
          url: "https://www.are.na/",
          evidence: {
            sourceId: t[4],
            quote: "I like how the blocks never shout",
          },
          details: [],
        },
        {
          label: "Project page split",
          kind: "component",
          weight: "normal",
          summary: "Image left, notes column fixed at 320 px",
          font: null,
          itemId: i.pencil,
          url: null,
          evidence: {
            sourceId: t[8],
            quote: "the notes column fixed at 320 px",
          },
          details: [],
        },
        {
          label: "Accent on links",
          kind: "principle",
          weight: "normal",
          summary: "#3B5BDB on links, every other element stays neutral",
          font: null,
          itemId: null,
          url: null,
          evidence: { sourceId: t[10], quote: "Nothing else gets colour." },
          details: [],
        },
        {
          label: "Calm motion",
          kind: "principle",
          weight: "minor",
          summary: "200 ms ease-out, no springs",
          font: null,
          itemId: null,
          url: null,
          evidence: { sourceId: t[11], quote: "Nothing bounces." },
          details: [
            {
              label: "No parallax",
              itemId: i.parallax,
              url: null,
              evidence: {
                sourceId: t[9],
                quote:
                  "Tried the parallax hero you suggested. It makes me seasick.",
              },
            },
          ],
        },
      ],
    },
  }),
};

// ---------- 2. Chinese session: 3 steps, 3 nodes, a few pictures ----------
const recipes = {
  id: "mock-c-recipes",
  name: "菜谱 App 引导页",
  provider: "Codex",
  turns: [
    [
      "user",
      "引导页不要三屏轮播了，用户根本不看。改成一屏：上面一张菜的照片，下面一个按钮“开始做饭”。",
    ],
    ["assistant", "已改成单屏引导：顶部全宽菜品照片，底部主按钮“开始做饭”。"],
    [
      "user",
      "参考一下 https://www.notion.com/ 的空状态，文字要短，语气像朋友。",
    ],
    ["user", "按钮颜色用番茄红 #E8590C，圆角 12px。其他地方都保持白底黑字。"],
    ["assistant", "主按钮已改为 #E8590C，圆角 12px，其余保持黑白。"],
    ["user", "第一次打开时不要弹通知权限，等用户收藏第一道菜以后再问。"],
  ],
  items: [
    {
      key: "carousel",
      kind: "image",
      title: "三屏轮播旧版",
      image: pic("cp-carousel", 900, 1600),
      context: "引导页不要三屏轮播了，用户根本不看。",
    },
    {
      key: "single",
      kind: "image",
      title: "单屏引导",
      image: pic("cp-single", 900, 1600),
      context: "改成一屏：上面一张菜的照片，下面一个按钮“开始做饭”。",
    },
    {
      key: "notion",
      kind: "link",
      title: "Notion",
      url: "https://www.notion.com/",
      context: "参考一下 https://www.notion.com/ 的空状态",
    },
  ],
  session: ({ t, i }) => ({
    steps: [
      {
        title: "砍掉三屏轮播",
        text: "我发现用户根本不看三屏轮播，所以改成一屏：上面一张菜的照片，下面只留一个“开始做饭”按钮。",
        canvas: {
          layout: "before-after",
          items: [
            { itemId: i.carousel, role: "before", label: "三屏轮播" },
            { itemId: i.single, role: "after", label: "单屏引导" },
          ],
          quote: null,
        },
        evidence: [
          { sourceId: t[0], quote: "引导页不要三屏轮播了，用户根本不看。" },
        ],
      },
      {
        title: "语气像朋友",
        text: "空状态我参考了 Notion：文字要短，语气像朋友在旁边提醒，而不是系统在下指令。",
        canvas: {
          layout: "reference",
          items: [
            { itemId: i.notion, role: "reference", label: "Notion 空状态" },
          ],
          quote: null,
        },
        evidence: [{ sourceId: t[2], quote: "文字要短，语气像朋友。" }],
      },
      {
        title: "晚一点再要通知权限",
        text: "第一次打开就弹权限太打扰了。我决定等用户收藏了第一道菜，真正有理由提醒时再问。",
        canvas: {
          layout: "quote",
          items: [],
          quote: { sourceId: t[5], text: "第一次打开时不要弹通知权限" },
        },
        evidence: [{ sourceId: t[5], quote: "等用户收藏第一道菜以后再问。" }],
      },
    ],
    map: {
      center: { label: "单屏引导页", itemId: i.single, url: null },
      nodes: [
        {
          label: "番茄红按钮",
          kind: "component",
          weight: "major",
          summary: "#E8590C，圆角 12px，全页唯一的颜色",
          font: null,
          itemId: null,
          url: null,
          evidence: {
            sourceId: t[3],
            quote: "按钮颜色用番茄红 #E8590C，圆角 12px。",
          },
          details: [
            {
              label: "白底黑字",
              itemId: null,
              url: null,
              evidence: { sourceId: t[3], quote: "其他地方都保持白底黑字。" },
            },
          ],
        },
        {
          label: "Notion",
          kind: "reference",
          weight: "normal",
          summary: "短句、朋友口吻的空状态",
          font: null,
          itemId: i.notion,
          url: "https://www.notion.com/",
          evidence: {
            sourceId: t[2],
            quote: "参考一下 https://www.notion.com/ 的空状态",
          },
          details: [],
        },
        {
          label: "延后授权",
          kind: "decision",
          weight: "minor",
          summary: "收藏第一道菜之后才请求通知",
          font: null,
          itemId: null,
          url: null,
          evidence: { sourceId: t[5], quote: "等用户收藏第一道菜以后再问。" },
          details: [],
        },
      ],
    },
  }),
};

// ---------- 3. Text only: 1 step, 1 node, no pictures at all ----------
const naming = {
  id: "mock-c-naming",
  name: "API naming rules",
  provider: "Codex",
  turns: [
    [
      "user",
      "Before we add more endpoints: every route is a plural noun, and actions are verbs only when they are not CRUD. So /invoices/42/send, never /sendInvoice.",
    ],
    [
      "assistant",
      "Renamed the four routes to plural nouns and moved send to /invoices/:id/send.",
    ],
    [
      "user",
      "Good. Errors always return a code and a human sentence, nothing else.",
    ],
  ],
  items: [],
  session: ({ t }) => ({
    steps: [
      {
        title: "Plural nouns for every route",
        text: "Before adding more endpoints I set the naming rule. Routes are plural nouns, and an action only gets a verb when it is not plain create, read, update or delete.",
        canvas: {
          layout: "quote",
          items: [],
          quote: {
            sourceId: t[0],
            text: "So /invoices/42/send, never /sendInvoice.",
          },
        },
        evidence: [{ sourceId: t[0], quote: "every route is a plural noun" }],
      },
    ],
    map: {
      center: { label: "Invoice API", itemId: null, url: null },
      nodes: [
        {
          label: "Error shape",
          kind: "principle",
          weight: "major",
          summary: "A code and one human sentence",
          font: null,
          itemId: null,
          url: null,
          evidence: {
            sourceId: t[2],
            quote:
              "Errors always return a code and a human sentence, nothing else.",
          },
          details: [],
        },
      ],
    },
  }),
};

// ---------- 4. Generation failed before any view existed ----------
const failed = {
  id: "mock-c-failed",
  name: "Landing page copy",
  provider: "Claude Code",
  turns: [
    [
      "user",
      "Rewrite the hero line so it says what the product does in under ten words.",
    ],
    [
      "assistant",
      "Option: Keep every idea from your AI sessions in one place.",
    ],
  ],
  items: [
    {
      key: "draft",
      kind: "image",
      title: "Hero draft",
      image: pic("cp-landing", 1440, 900),
      context: "Rewrite the hero line.",
    },
  ],
  session: null,
  error: "The story model did not respond. Retry later.",
};

const MOCKS = [portfolio, recipes, naming, failed];

// ---------- Build rows, validate, write SQL ----------
const q = (v) =>
  v === null || v === undefined
    ? "NULL"
    : `'${String(v).replaceAll("'", "''")}'`;

function rows(mock) {
  const slug = mock.id.replace("mock-c-", "");
  const sessionId = `mock-s-${slug}`;
  const turns = mock.turns.map(([role, body], n) => ({
    id: `mock-t-${slug}-${String(n).padStart(2, "0")}`,
    role,
    body,
    createdAt: at(n * 3),
  }));
  const items = mock.items.map((it, n) => ({
    ...it,
    id: `mock-i-${slug}-${it.key}`,
    createdAt: at(n * 3 + 1),
  }));
  const t = turns.map((turn) => turn.id);
  const i = Object.fromEntries(items.map((it) => [it.key, it.id]));
  let session = null;
  if (mock.session) {
    const input = {
      transcript: turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        text: turn.body,
      })),
      media: items.map((it) => ({
        id: it.id,
        title: it.title,
        note: "",
        context: it.context,
        url: it.url || null,
      })),
    };
    try {
      session = validateSession(mock.session({ t, i }), input);
    } catch (error) {
      throw new Error(`${mock.name}: ${error.message}`);
    }
  }
  return { slug, sessionId, turns, items, session };
}

function clearSql() {
  const like = "'mock-%'";
  return [
    `DELETE FROM story_beats WHERE collection_id LIKE ${like};`,
    `DELETE FROM stories WHERE collection_id LIKE ${like};`,
    `DELETE FROM turns WHERE id LIKE ${like};`,
    `DELETE FROM items WHERE id LIKE ${like};`,
    `DELETE FROM sessions WHERE id LIKE ${like};`,
    `DELETE FROM collections WHERE id LIKE ${like};`,
  ];
}

function seedSql(mock) {
  const { sessionId, turns, items, session } = rows(mock);
  const created = at(0);
  const sql = [
    `INSERT INTO collections(id,owner_id,name,description,created_at) VALUES(${q(mock.id)},${q(OWNER)},${q(mock.name)},'',${q(created)});`,
    `INSERT INTO sessions(id,owner_id,collection_id,title,provider,mode,state,token_hash,external_id,last_seen,created_at) VALUES(${q(sessionId)},${q(OWNER)},${q(mock.id)},${q(mock.name)},${q(mock.provider)},'follow','paused','mock',${q(sessionId)},${q(at(60))},${q(created)});`,
  ];
  for (const it of items)
    sql.push(
      `INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,body,url,image_url,preview_status,source_text,source_role,source_turn,inferred,created_at,updated_at) VALUES(${q(it.id)},${q(OWNER)},${q(sessionId)},${q(mock.id)},${q(it.id)},${q(it.kind)},${q(it.title)},'',${q(it.url || null)},${q(it.image || null)},${q(it.kind === "link" ? "pending" : "ready")},${q(it.context)},'user','',0,${q(it.createdAt)},${q(it.createdAt)});`,
    );
  for (const turn of turns)
    sql.push(
      `INSERT INTO turns(id,session_id,owner_id,external_id,role,body,digest_status,created_at) VALUES(${q(turn.id)},${q(sessionId)},${q(OWNER)},${q(turn.id)},${q(turn.role)},${q(turn.body)},'done',${q(turn.createdAt)});`,
    );
  // The insert triggers queued work; mark it processed so nothing tries to regenerate.
  const turnSequence = `(SELECT COALESCE(MAX(rowid),0)+1 FROM turns WHERE session_id=${q(sessionId)})`;
  sql.push(
    session
      ? `UPDATE stories SET session_json=${q(JSON.stringify(session))},session_model='mock',processed_revision=revision,status='ready',error=NULL,lease_token=NULL,lease_until=0,next_attempt_at=0,checkpoint=json_object('turnSequence',${turnSequence},'turnOffset',0),updated_at=${q(at(60))} WHERE collection_id=${q(mock.id)};`
      : `UPDATE stories SET session_json=NULL,status='error',error=${q(mock.error)},lease_token=NULL,lease_until=0,next_attempt_at=${Date.now() + 3650 * 86400000},updated_at=${q(at(60))} WHERE collection_id=${q(mock.id)};`,
  );
  return sql;
}

if (!existsSync(CONFIG)) {
  console.error(`Missing ${CONFIG}. Run \`npm run build\` once first.`);
  process.exit(1);
}
const statements = [
  ...clearSql(),
  ...(clearOnly ? [] : MOCKS.flatMap(seedSql)),
];
const dir = mkdtempSync(join(tmpdir(), "commonplace-mock-"));
const file = join(dir, "seed.sql");
writeFileSync(file, statements.join("\n") + "\n");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--config",
    CONFIG,
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--file",
    file,
  ],
  { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
);
rmSync(dir, { recursive: true, force: true });
if (result.status !== 0) {
  console.error(result.stdout);
  process.exit(result.status ?? 1);
}
console.log(
  clearOnly
    ? "Removed mock collections."
    : `Seeded ${MOCKS.length} mock collections: ${MOCKS.map((m) => m.name).join(", ")}.`,
);
