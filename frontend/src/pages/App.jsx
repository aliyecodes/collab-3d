import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../lib/api";

export default function App() {
  const [name, setName] = useState(localStorage.getItem("user") || "");
  const [title, setTitle] = useState("");
  const [projects, setProjects] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    axios.get(`${API_BASE}/projects`).then((res) => setProjects(res.data || []));
  }, []);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    try {
      setLoggingIn(true);
      localStorage.setItem("user", name.trim());
      alert(`Login simulato come ${name.trim()}`);
    } finally {
      setLoggingIn(false);
    }
  };

  const createProject = async (e) => {
    e?.preventDefault();
    const t = title.trim();
    if (!t) return;

    try {
      setCreating(true);
      const res = await axios.post(`${API_BASE}/projects`, { title: t });
      setProjects((prev) => [...prev, { id: res.data.id, title: res.data.title }]);
      setTitle("");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || "Unknown error";
      alert("Create failed: " + msg);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (id, titleForConfirm) => {
    const ok = window.confirm(`"${titleForConfirm}" projesini silmek istediğine emin misin?`);
    if (!ok) return;
    try {
      setDeletingId(id);
      await axios.delete(`${API_BASE}/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Proje silinirken bir hata oluştu.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-cyan-100 px-6 py-10">
      <div className="w-full max-w-5xl mx-auto mb-8 grid grid-cols-[1fr_auto_1fr] items-start">
        <div /> 
        <div className="text-center">
          <h1 className="font-orbitron text-3xl font-bold text-cyan-300 drop-shadow-md">
            3D Collab MVP
          </h1>
          <p className="text-sm text-cyan-200/70 mt-1">
            Dummy login · Project creation · Listing
          </p>
        </div>
        <div className="justify-self-end">
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="btn-oval !px-3 !py-1.5"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      <div className="w-full flex flex-col items-center gap-6">
        <section className="panel w-1/2 mx-auto">
          <div className="px-10 pt-8 pb-8 space-y-4 flex flex-col items-center">
            <h2 className="text-xl font-semibold text-cyan-200">Dummy Login</h2>

            <form onSubmit={handleLogin} className="form-inline" autoComplete="off">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="alice / bob"
                className="input-neo input-lg"
                aria-label="Username"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={loggingIn}
                className={`btn-oval btn-primary ${loggingIn ? "opacity-60 cursor-not-allowed" : ""}`}
                aria-label="Enter"
              >
                {loggingIn ? "..." : "Enter"}
              </button>
            </form>

            <p className="text-xs text-cyan-300/60 text-center">
              The username is saved to localStorage.
            </p>
          </div>
        </section>

        <section className="panel w-1/2 mx-auto">
          <div className="px-10 pt-8 pb-8 space-y-4 flex flex-col items-center">
            <h2 className="text-xl font-semibold text-cyan-200">Create project</h2>

            <form onSubmit={createProject} className="form-inline form-inline--spaced" autoComplete="off">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title"
                className="input-neo input-lg"
                aria-label="Project title"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={creating}
                className={`btn-oval btn-success ${creating ? "opacity-60 cursor-not-allowed" : ""}`}
                aria-label="Create project"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        </section>

        <section className="panel w-1/2 mx-auto">
          <div className="px-10 pt-8 pb-8 space-y-5 flex flex-col items-center">
            <h2 className="text-xl font-semibold text-cyan-200">Projects</h2>

            <ul className="projects-list flex flex-col items-center gap-3 w-full">
              {projects.map((p) => (
                <li key={p.id} className="project-card group relative w-1/2 px-4 py-3">
                  <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-cyan-500/10" />

                  <div className="project-row relative z-[1]">
                    <span className="title truncate pr-3">{p.title}</span>

                    <div className="actions">
                      <Link to={`/project/${p.id}`} className="btn-oval btn-primary" aria-label={`Open ${p.title}`}>
                        Open
                      </Link>
                      <button
                        onClick={() => deleteProject(p.id, p.title)}
                        disabled={deletingId === p.id}
                        aria-label={`Delete ${p.title}`}
                        className={`btn-oval btn-danger ${deletingId === p.id ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        {deletingId === p.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}

              {projects.length === 0 && (
                <li className="text-cyan-300/60 text-center py-6 w-1/2">No projects yet</li>
              )}
            </ul>
          </div>
        </section>
      </div>

      <footer className="footer">
        © {new Date().getFullYear()} 3D Collab MVP — Built by{" "}
        <a href="https://github.com/aliyecodes" target="_blank" rel="noopener noreferrer">
          Aliyecodes
        </a>
        .
      </footer>
    </div>
  );
}
