import StreamDeckEmulatorPanel from "../components/StreamDeckEmulator";

function StreamDeckEmulator() {
  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)" }}>
      <div className="max-w-5xl mx-auto">
        <StreamDeckEmulatorPanel />
      </div>
    </main>
  );
}

export default StreamDeckEmulator;
