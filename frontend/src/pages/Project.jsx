import { useEffect, useRef, useState, forwardRef } from "react";
import * as THREE from "three";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls, Html } from "@react-three/drei";
import { API_BASE } from "../lib/api";
import { v4 as uuid } from "uuid";
import { io } from "socket.io-client";

export default function Project() {
  const { id } = useParams();

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("translate");
  const [dragging, setDragging] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [cube, setCube] = useState({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1.8, 1.8, 1.8],
  });
  const [focusPos, setFocusPos] = useState(null);

  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [userViews, setUserViews] = useState({});
  const [openChat, setOpenChat] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/projects/${id}`);
        const p = res.data;
        setTitle(p.title || "");

        let s = p.sceneState || {};
        if (!s.objects || !s.objects.length) {
          const fromLocal = localStorage.getItem(`scene-${id}`);
          if (fromLocal) s = JSON.parse(fromLocal);
        }

        if (s.objects && s.objects[0]) {
          const o = s.objects[0];
          setCube({
            position: o.position || [0, 0, 0],
            rotation: o.rotation || [0, 0, 0],
            scale: o.scale || [1.8, 1.8, 1.8],
          });
        }
        setAnnotations(Array.isArray(s.annotations) ? s.annotations : []);
      } catch {
        const fromLocal = localStorage.getItem(`scene-${id}`);
        if (fromLocal) {
          const s = JSON.parse(fromLocal);
          if (s.objects && s.objects[0]) {
            const o = s.objects[0];
            setCube({
              position: o.position || [0, 0, 0],
              rotation: o.rotation || [0, 0, 0],
              scale: o.scale || [1.8, 1.8, 1.8],
            });
          }
          setAnnotations(Array.isArray(s.annotations) ? s.annotations : []);
        }
      }
    })();
  }, [id]);

  const [socket, setSocket] = useState(null);
  const [cameraState, setCameraState] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    const s = io(import.meta.env.VITE_SOCKET_URL, {
      withCredentials: true,
    });
    setSocket(s);
    s.emit("join", {
      projectId: id,
      user: localStorage.getItem("user") || "Anon",
    });

    const onChat = (payload) => {
      const msg = payload?.message ?? payload;
      if (!msg) return;

      setChat((prev) => {
        const exists = prev.some(
          (m) => m.ts === msg.ts && m.user === msg.user && m.text === msg.text
        );
        return exists ? prev : [...prev, msg];
      });
    };

    const onCamera = ({ camera, user }) => {
      if (!camera || !user) return;
      setUserViews((prev) => ({
        ...prev,
        [user]: { target: camera.target, ts: Date.now() },
      }));
      setCameraState(camera);
    };

    const onAnnAdd = (ann) => {
      setAnnotations((prev) => {
        if (prev.some((a) => a.id === ann.id)) return prev;
        return [...prev, ann];
      });
    };

    s.on("chat", onChat);
    s.on("camera", onCamera);
    s.on("annotation:add", onAnnAdd);

    return () => {
      s.off("chat", onChat);
      s.off("camera", onCamera);
      s.off("annotation:add", onAnnAdd);
      s.disconnect();
    };
  }, [id]);

  const saveScene = async () => {
    const sceneState = {
      camera: cameraState || null,
      objects: [{ id: "cube-1", type: "cube", ...cube }],
      annotations,
    };
    await axios.put(`${API_BASE}/projects/${id}/scene`, { sceneState });
    localStorage.setItem(`scene-${id}`, JSON.stringify(sceneState));
    alert("Saved ✅");
  };

  const cubeRef = useRef();

  const handleAddAnnotationFromEvent = (ev) => {
    const text = prompt("Annotation text?");
    const value = (text || "").trim();
    if (!value) return;

    const user = localStorage.getItem("user") || "Anon";

    const hit = ev.intersections?.find((i) => i.object === cubeRef.current);
    if (hit && cubeRef.current) {
      const local = cubeRef.current.worldToLocal(hit.point.clone());
      const ann = {
        id: uuid(),
        text: value,
        user,
        anchor: { objectId: "cube-1", local: [local.x, local.y, local.z] },
      };
      setAnnotations((prev) => [...prev, ann]);
      socket?.emit("annotation:add", { projectId: id, annotation: ann });
      return;
    }

    const pt = ev.point;
    if (!pt) return;
    const ann = {
      id: uuid(),
      text: value,
      user,
      position: [pt.x, pt.y, pt.z],
    };
    setAnnotations((prev) => [...prev, ann]);
    socket?.emit("annotation:add", { projectId: id, annotation: ann });
  };

  const me = localStorage.getItem("user") || "Anon";

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !socket) return;

    const msg = {
      user: me,
      text,
      ts: Date.now(),
    };

    setChat((prev) => [...prev, msg]);
    socket.emit("chat", { projectId: id, message: msg });
    setChatInput("");
  };

  const cleanupTouchRef = useRef(null);
  const onCanvasCreated = ({ gl }) => {
    const canvasEl = gl.domElement;
    let lastTap = 0;
    const handleTouchEnd = (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const now = Date.now();
      const delta = now - lastTap;
      if (delta > 0 && delta < 300) {
        e.preventDefault();
        const dbl = new MouseEvent("dblclick", {
          clientX: t.clientX,
          clientY: t.clientY,
          bubbles: true,
          cancelable: true,
        });
        canvasEl.dispatchEvent(dbl);
      }
      lastTap = now;
    };
    canvasEl.addEventListener("touchend", handleTouchEnd, { passive: false });
    cleanupTouchRef.current = () =>
      canvasEl.removeEventListener("touchend", handleTouchEnd);
  };
  useEffect(() => () => cleanupTouchRef.current?.(), []);

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <header className="panel px-5 py-3 border-b border-cyan-400/30 flex items-center gap-3">
        <Link
          to="/"
          className="btn-oval !px-3 !py-1.5 inline-flex items-center gap-2"
          title="Back to Projects"
        >
          <span aria-hidden>←</span>
          <span className="tracking-wide">Projects</span>
        </Link>

        <h1 className="text-lg font-semibold tracking-wide text-cyan-100 font-orbitron mx-auto text-center">
          Project: {title}
        </h1>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setMode("translate")}
            className={`btn-neo ${
              mode === "translate" ? "btn-neo-active" : ""
            }`}
          >
            Move
          </button>
          <button
            onClick={() => setMode("rotate")}
            className={`btn-neo ${mode === "rotate" ? "btn-neo-active" : ""}`}
          >
            Rotate
          </button>
          <button
            onClick={() => setMode("scale")}
            className={`btn-neo ${mode === "scale" ? "btn-neo-active" : ""}`}
          >
            Scale
          </button>
          <button onClick={saveScene} className="btn-neo">
            Save
          </button>

          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="btn-oval !px-3 !py-1.5"
            title="Toggle theme"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>
      <div className="header-line"></div>

      <main className="flex-1 p-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="lg:hidden flex justify-end mb-2">
            <button onClick={() => setOpenChat((o) => !o)} className="btn-oval">
              {openChat ? "Hide chat" : "Show chat"}
            </button>
          </div>

          <div className="canvas-wrap" style={{ height: "72vh" }}>
            <Canvas
              camera={{ position: [5, 4.5, 6], fov: 50 }}
              onCreated={onCanvasCreated}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleAddAnnotationFromEvent(e);
              }}
            >
              <hemisphereLight
                intensity={0.6}
                color="#bcdcff"
                groundColor="#0b1220"
              />
              <ambientLight intensity={0.35} />
              <pointLight position={[10, 10, 10]} intensity={0.7} />
              <gridHelper args={[20, 20, "#60a5fa", "#334155"]} />

              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleAddAnnotationFromEvent(e);
                }}
              >
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial transparent opacity={0} />
              </mesh>

              <SceneCube
                ref={cubeRef}
                cube={cube}
                setCube={setCube}
                mode={mode}
                setDragging={setDragging}
              />

              {annotations.map((a) => (
                <AnnotationPin
                  key={a.id}
                  a={a}
                  targetRef={cubeRef}
                  onFocus={(world) => setFocusPos(world)}
                  onEdit={(next) =>
                    setAnnotations((prev) =>
                      prev.map((x) => (x.id === a.id ? { ...a, ...next } : x))
                    )
                  }
                  onDelete={() =>
                    setAnnotations((prev) => prev.filter((x) => x.id !== a.id))
                  }
                />
              ))}

              <OrbitControls
                makeDefault
                enabled={!dragging}
                enableDamping
                dampingFactor={0.08}
                rotateSpeed={0.9}
                panSpeed={0.9}
                onChange={(e) => {
                  const cam = e.target.object;
                  const tgt = e.target.target;
                  const payload = {
                    position: [cam.position.x, cam.position.y, cam.position.z],
                    target: [tgt.x, tgt.y, tgt.z],
                  };
                  setCameraState(payload);

                  socket?.emit("camera", {
                    projectId: id,
                    camera: payload,
                    user: me,
                  });
                }}
              />

              <CameraApplier cameraState={cameraState} />
              <FocusHelper focusPos={focusPos} />

              <UserCameraIndicators userViews={userViews} me={me} />
            </Canvas>
          </div>

          <aside
            className={`panel p-3 flex flex-col h-[72vh] w-full lg:w-[280px] max-w-[92vw] mx-auto lg:mx-0 rounded-2xl bg-gradient-to-br from-white/70 to-slate-100/40 dark:from-slate-900/60 dark:to-slate-800/40 shadow-[0_0_15px_rgba(0,0,0,0.15)] backdrop-blur-md border border-slate-300/40 dark:border-cyan-400/20 transition ${
              openChat ? "block" : "hidden"
            } lg:block`}
          >
            <h2 className="font-orbitron text-sm text-cyan-600 dark:text-cyan-200 mb-2 text-center tracking-widest">
              Real-time Chat
            </h2>

            <div className="flex-1 overflow-auto space-y-3 px-2 custom-scroll">
              {chat.map((m, i) => (
                <div
                  key={m.id ?? m.ts ?? i}
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words shadow-sm ${
                    m.user === me
                      ? "bg-gradient-to-r from-cyan-500/80 to-blue-500/80 text-white self-end ml-auto"
                      : "bg-white/70 dark:bg-slate-700/60 text-slate-800 dark:text-cyan-100 border border-slate-200/30 dark:border-cyan-400/20"
                  }`}
                >
                  <span className="font-semibold block text-xs opacity-80 mb-0.5">
                    {m.user}
                  </span>
                  {m.text}
                </div>
              ))}
              {chat.length === 0 && (
                <div className="text-xs text-gray-400 text-center mt-10">
                  No messages yet
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2 border-t border-slate-300/40 dark:border-cyan-400/20 pt-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Type a message…"
                className="input-neo input-lg flex-1"
              />
              <button onClick={sendChat} className="btn-oval btn-primary">
                Send
              </button>
            </div>
          </aside>
        </div>
      </main>

      <footer className="footer">
        © {new Date().getFullYear()} 3D Collab MVP — Built by{" "}
        <a
          href="https://github.com/aliyecodes"
          target="_blank"
          rel="noopener noreferrer"
        >
          Aliyecodes
        </a>
        .
      </footer>
    </div>
  );
}

const SceneCube = forwardRef(function SceneCube(
  { cube, setCube, mode, setDragging },
  ref
) {
  const handleObjectChange = (e) => {
    const obj = e?.target?.object;
    if (!obj) return;
    const { position, rotation, scale } = obj;
    setCube({
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: [scale.x, scale.y, scale.z],
    });
  };

  return (
    <TransformControls
      mode={mode}
      size={2}
      onObjectChange={handleObjectChange}
      onMouseDown={() => setDragging(true)}
      onMouseUp={() => setDragging(false)}
    >
      <mesh
        ref={ref}
        position={cube?.position || [0, 0, 0]}
        rotation={cube?.rotation || [0, 0, 0]}
        scale={cube?.scale || [1.8, 1.8, 1.8]}
      >
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial
          color="#dbeafe"
          roughness={0.35}
          metalness={0.15}
          emissive="#60a5fa"
          emissiveIntensity={0.12}
        />
      </mesh>
    </TransformControls>
  );
});

function AnnotationPin({ a, targetRef, onEdit, onDelete, onFocus }) {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;

    if (a.anchor && targetRef?.current) {
      const [lx, ly, lz] = a.anchor.local || [0, 0, 0];
      const local = new THREE.Vector3(lx, ly, lz);
      const world = targetRef.current.localToWorld(local.clone());
      groupRef.current.position.copy(world);
    } else if (Array.isArray(a.position)) {
      groupRef.current.position.set(
        a.position[0],
        a.position[1],
        a.position[2]
      );
    }
  });

  const handleFocus = (e) => {
    e.stopPropagation();
    if (!groupRef.current) return;
    const world = groupRef.current.getWorldPosition(new THREE.Vector3());
    onFocus?.(world);
  };

  return (
    <group ref={groupRef} onClick={handleFocus}>
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>

      <Html distanceFactor={10} position={[0.18, 0.18, 0]}>
        <div
          className="anno anno-holo animate-fade-in animate-holo cursor-pointer"
          onClick={handleFocus}
          title="Focus camera here"
        >
          <div className="text-[10px] opacity-70 -mb-0.5">
            {a.user || "Anon"}
          </div>
          <span className="max-w-[220px] truncate" title={a?.text || ""}>
            {a?.text || ""}
          </span>
          <button
            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const next = prompt("Edit text:", a?.text || "");
              if (next != null && next.trim()) onEdit({ text: next.trim() });
            }}
            title="Edit"
          >
            ✎
          </button>
          <button
            className="px-2 py-0.5 rounded bg-red-600/80 text-white hover:bg-red-700"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete annotation?")) onDelete();
            }}
            title="Delete"
          >
            ✖
          </button>
        </div>
      </Html>
    </group>
  );
}

function CameraApplier({ cameraState }) {
  const { camera, controls } = useThree((s) => ({
    camera: s.camera,
    controls: s.controls,
  }));

  useEffect(() => {
    if (!cameraState || !controls) return;
    const { position, target } = cameraState;
    if (Array.isArray(position) && position.length === 3) {
      camera.position.set(position[0], position[1], position[2]);
    }
    if (Array.isArray(target) && target.length === 3) {
      controls.target.set(target[0], target[1], target[2]);
    }
    controls.update();
  }, [cameraState, camera, controls]);

  return null;
}

function FocusHelper({ focusPos }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (!focusPos || !controls) return;

    const target = new THREE.Vector3(focusPos.x, focusPos.y, focusPos.z);

    const startCam = camera.position.clone();
    const startTgt = controls.target.clone();

    const dir = new THREE.Vector3().subVectors(startCam, startTgt).normalize();
    const endTgt = target.clone();
    const endCam = target.clone().add(dir.multiplyScalar(2.5));

    const duration = 600;
    const start = performance.now();

    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      camera.position.lerpVectors(startCam, endCam, e);
      controls.target.lerpVectors(startTgt, endTgt, e);
      controls.update();

      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focusPos, camera, controls]);

  return null;
}

function UserCameraIndicators({ userViews, me }) {
  const entries = Object.entries(userViews);

  return entries.map(([user, info]) => {
    if (user === me) return null;

    const [x, y, z] = info?.target || [0, 0, 0];
    if (Date.now() - (info?.ts || 0) > 8000) return null;

    return (
      <group key={user} position={[x, y, z]}>
        <mesh>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={0.35}
          />
        </mesh>
        <Html distanceFactor={12} position={[0.18, 0.18, 0]}>
          <div className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/80 text-white border border-cyan-200/40 shadow">
            {user}
          </div>
        </Html>
      </group>
    );
  });
}
