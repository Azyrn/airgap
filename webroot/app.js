const PKG_SAFE = /^[A-Za-z0-9._-]+$/;

let seq = 0;

function exec(cmd) {
	return new Promise((resolve, reject) => {
		const cb = `ag_cb_${Date.now()}_${seq++}`;
		window[cb] = (errno, stdout, stderr) => {
			delete window[cb];
			resolve({ errno, stdout, stderr });
		};
		try {
			ksu.exec(cmd, "{}", cb);
		} catch (err) {
			delete window[cb];
			reject(err);
		}
	});
}

async function sh(cmd) {
	const { errno, stdout, stderr } = await exec(cmd);
	if (errno !== 0) throw new Error(stderr || `command failed (${errno})`);
	return stdout.trim();
}

const BIN = "/data/adb/modules/airgap/system/bin/airgap";
const cli = (args) => sh(`${BIN} ${args}`);

const el = {
	list: document.getElementById("list"),
	search: document.getElementById("search"),
	tabs: document.getElementById("tabs"),
	sort: document.getElementById("sort"),
	count: document.getElementById("count"),
	shown: document.getElementById("shown"),
	empty: document.getElementById("empty"),
	menu: document.getElementById("menu"),
	modal: document.getElementById("modal"),
	modalTitle: document.getElementById("modal-title"),
	modalBody: document.getElementById("modal-content"),
	toast: document.getElementById("toast"),
	rowTpl: document.getElementById("row"),
};

const state = { apps: [], filter: "all", query: "" };

let toastTimer;
function toast(msg) {
	el.toast.textContent = msg;
	el.toast.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (el.toast.hidden = true), 2600);
}

function shortName(pkg) {
	const parts = pkg.split(".");
	return parts[parts.length - 1] || pkg;
}

function buildRows() {
	const frag = document.createDocumentFragment();
	for (const app of state.apps) {
		const node = el.rowTpl.content.firstElementChild.cloneNode(true);
		node.querySelector(".pkg b").textContent = shortName(app.p);
		node.querySelector(".sub").textContent = `uid ${app.u} · ${app.p}`;
		if (!app.s) node.classList.add("user");
		const box = node.querySelector("input");
		box.checked = !!app.b;
		box.addEventListener("change", () => onToggle(app, box));
		app.el = node;
		app.box = box;
		app.key = app.p.toLowerCase();
		frag.appendChild(node);
	}
	el.list.appendChild(frag);
}

function matches(app) {
	if (state.query && !app.key.includes(state.query)) return false;
	if (state.filter === "user") return !app.s;
	if (state.filter === "system") return !!app.s;
	if (state.filter === "blocked") return !!app.b;
	return true;
}

const SORTERS = {
	name: (a, b) => a.key.localeCompare(b.key),
	"name-desc": (a, b) => b.key.localeCompare(a.key),
	blocked: (a, b) => b.b - a.b || a.key.localeCompare(b.key),
	"user-first": (a, b) => a.s - b.s || a.key.localeCompare(b.key),
	"system-first": (a, b) => b.s - a.s || a.key.localeCompare(b.key),
	uid: (a, b) => a.u - b.u,
};

function render() {
	state.apps.sort(SORTERS[el.sort.value]);
	const frag = document.createDocumentFragment();
	let visible = 0;
	for (const app of state.apps) {
		const show = matches(app);
		app.el.hidden = !show;
		if (show) visible++;
		frag.appendChild(app.el);
	}
	el.list.appendChild(frag);
	el.empty.hidden = visible > 0;
	el.shown.textContent = `${visible} shown`;
	updateCount();
}

function updateCount() {
	const blocked = state.apps.filter((a) => a.b).length;
	el.count.textContent = `${blocked} blocked · ${state.apps.length} apps`;
}

let saveTimer;
let saving = false;
let dirty = false;

function onToggle(app, box) {
	app.b = box.checked;
	app.el.classList.add("busy");
	updateCount();
	clearTimeout(saveTimer);
	saveTimer = setTimeout(commit, 350);
}

// One CLI call rewrites the whole isolated set, so the chain is rebuilt from a
// single source of truth instead of drifting per-toggle.
async function commit() {
	if (saving) {
		dirty = true;
		return;
	}
	saving = true;
	do {
		dirty = false;
		const picked = state.apps.filter((a) => a.b).map((a) => a.p).filter((p) => PKG_SAFE.test(p));
		try {
			await cli(picked.length ? `set ${picked.join(" ")}` : "set --none");
			toast(`${picked.length} app${picked.length === 1 ? "" : "s"} isolated`);
		} catch (err) {
			toast(err.message);
		}
	} while (dirty);
	saving = false;
	document.querySelectorAll(".row.busy").forEach((row) => row.classList.remove("busy"));
}

async function load() {
	el.empty.hidden = true;
	try {
		state.apps = JSON.parse(await cli("apps"));
	} catch (err) {
		el.empty.textContent = `Cannot read app list: ${err.message}`;
		el.empty.hidden = false;
		return;
	}
	el.list.textContent = "";
	buildRows();
	render();
}

/* ------------------------------------------------------------ backup sheets */

function sheet(title, build) {
	el.modalTitle.textContent = title;
	el.modalBody.textContent = "";
	build(el.modalBody);
	el.modal.hidden = false;
}

function button(parent, html, onClick, cls) {
	const b = document.createElement("button");
	b.innerHTML = html;
	if (cls) b.className = cls;
	b.addEventListener("click", onClick);
	parent.appendChild(b);
	return b;
}

async function doExport() {
	try {
		toast(`Saved to ${await cli("backup")}`);
	} catch (err) {
		toast(err.message);
	}
}

async function doImport() {
	let files = [];
	try {
		files = JSON.parse(await cli("backups"));
	} catch { /* listing is best effort */ }

	sheet("Import backup", (body) => {
		const opt = document.createElement("label");
		opt.className = "opt";
		opt.innerHTML = '<input type="checkbox" id="merge"> Merge with current list';
		body.appendChild(opt);

		if (files.length) {
			for (const f of files) {
				button(
					body,
					`<span class="file"><span>${f.name}<br><small>${f.count} apps</small></span><small>${f.when}</small></span>`,
					() => restore(`restore '${f.path.replace(/'/g, "")}'`),
				);
			}
		} else {
			const p = document.createElement("p");
			p.className = "empty";
			p.textContent = "No backup files found. Paste one below.";
			body.appendChild(p);
		}

		const area = document.createElement("textarea");
		area.placeholder = '{"packages":["com.example.app"]}';
		body.appendChild(area);
		button(body, "Import pasted JSON", () => {
			if (!area.value.trim()) return toast("Nothing to import");
			restore(`import-b64 ${btoa(area.value)}`);
		});
	});
}

async function restore(args) {
	const merge = document.getElementById("merge");
	try {
		const out = await cli(`${args}${merge && merge.checked ? " --merge" : ""}`);
		el.modal.hidden = true;
		await load();
		toast(out);
	} catch (err) {
		toast(err.message);
	}
}

async function showStatus() {
	sheet("Status", (body) => {
		const pre = document.createElement("pre");
		pre.textContent = "Loading…";
		body.appendChild(pre);
		cli("status").then((out) => (pre.textContent = out), (err) => (pre.textContent = err.message));
	});
}

async function unblockAll() {
	try {
		await cli("unblock all");
		state.apps.forEach((a) => {
			a.b = 0;
			a.box.checked = false;
		});
		render();
		toast("All apps unblocked");
	} catch (err) {
		toast(err.message);
	}
}

/* ------------------------------------------------------------------- events */

let searchTimer;
el.search.addEventListener("input", () => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => {
		state.query = el.search.value.trim().toLowerCase();
		render();
	}, 120);
});

el.tabs.addEventListener("click", (ev) => {
	const btn = ev.target.closest("button");
	if (!btn) return;
	el.tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
	state.filter = btn.dataset.filter;
	render();
});

el.sort.addEventListener("change", render);

document.getElementById("menu-btn").addEventListener("click", () => (el.menu.hidden = false));

el.menu.addEventListener("click", (ev) => {
	const act = ev.target.dataset.act;
	if (!act && ev.target !== el.menu) return;
	el.menu.hidden = true;
	({
		export: doExport,
		import: doImport,
		reapply: () => cli("apply").then(() => toast("Rules reloaded"), (e) => toast(e.message)),
		"unblock-all": unblockAll,
		status: showStatus,
	})[act]?.();
});

el.modal.addEventListener("click", (ev) => {
	if (ev.target === el.modal || ev.target.dataset.act === "close") el.modal.hidden = true;
});

load();
