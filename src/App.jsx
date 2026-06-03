import { useState } from "react";

function saveProgressToTrello(progress) {
  try {
    const t = window.TrelloPowerUp?.iframe();
    if (t) {
      t.set("card", "shared", "progress", progress);
    }
  } catch (err) {
    console.error("Trello save error:", err);
  }
}

export default function App() {
  const [progress, setProgress] = useState(32);
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [progressSteps, setProgressSteps] = useState(12);
  const [segmentGap, setSegmentGap] = useState(4);

  return (
    <div className="w-screen bg-[#0e0f13] flex items-start justify-center py-10">
      {/* CARD */}
      <div className="w-[700px] bg-[#0e0f13] text-gray-300 p-6 rounded-xl border border-[#1f232b] space-y-6">
        {/* HEADER */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">slack</h2>
          <div className="flex gap-2">
            {["Add", "Labels", "Dates", "Checklist", "Members"].map((item) => (
              <button
                key={item}
                className="bg-[#1a1d23] border border-[#2a2f37] px-3 py-1.5 rounded-lg text-sm hover:bg-[#272b33]"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* PROGRESS SECTION */}
        <div className="bg-[#121318] border border-[#1f232b] p-5 rounded-xl">
          <h3 className="text-gray-200 mb-4 flex items-center text-sm">
            ⚡ <span className="ml-2">Progress</span>
          </h3>

          {/* Progress Bar */}
          <div className="relative mb-3">
            <div className="w-full h-2 bg-[#22262e] rounded-full">
              <div
                className="h-full rounded-full"
                style={{ background: "#2ec4b6", width: `${progress}%` }}
              ></div>
            </div>

            <span
              className="absolute right-0 -top-1 text-sm"
              style={{ color: "#38e1d3" }}
            >
              {progress}%
            </span>
          </div>

          {/* Slider */}
          <p className="text-xs text-gray-400 mb-1">Adjust progress manually</p>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">0%</span>

            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => {
                setProgress(e.target.value);
                saveProgressToTrello(e.target.value); // 🔥 Saves to Trello
              }}
              className="w-[85%] cursor-pointer"
              style={{ accentColor: "#2ec4b6" }}
            />

            <span className="text-xs text-gray-500">100%</span>
          </div>
        </div>

        {/* DESCRIPTION SECTION */}
        <div className="bg-[#121318] border border-[#1f232b] p-5 rounded-xl">
          <h3 className="text-gray-200 mb-3 text-sm">📝 Description</h3>

          <textarea
            placeholder="Add context or notes for this task..."
            className="w-full h-32 bg-[#0e0f13] border border-[#2a2f37] rounded-lg p-3 text-gray-300 resize-none outline-none focus:border-[#2ec4b6] transition"
          ></textarea>
        </div>

        {/* ADVANCED PROGRESS PAGE (INSIDE SAME CARD) */}
        <div className="bg-[#121318] border border-[#1f232b] p-5 rounded-xl">
          {/* Top Row */}
          <div className="flex justify-between items-center">
            <h3 className="text-gray-200 text-sm">Progress</h3>
            <span className="text-teal-300 text-sm">{progress}%</span>
          </div>

          {/* Elapsed Time Section */}
          <div className="mt-6 flex justify-between mb-2">
            <div className="text-sm flex items-center gap-2">
              <span className="text-teal-300">⏱</span>
              Elapsed Time
            </div>

            <div className="text-sm text-gray-300">
              Estimated <span className="font-semibold">08:00:00</span>
            </div>
          </div>

          <div className="bg-[#2a2f37] text-white px-3 py-2 rounded-md text-center mb-3">
            ⚠️ Behind schedule
          </div>

          <div className="flex gap-3 mb-4">
            <button className="flex-1 bg-teal-500 text-black py-2 rounded-md text-sm">
              ▶️ Start Tracking
            </button>
            <button className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded-md text-sm">
              ↻ Reset
            </button>
          </div>

          <div className="flex justify-between items-center text-sm mb-6">
            <span className="text-gray-300">Enable automatic tracking</span>
            <input type="checkbox" className="accent-teal-400 h-4 w-4" />
          </div>

          {/* CIRCULAR PROGRESS PREVIEW */}
          <div className="bg-[#0e0f13] border border-[#2a2f37] rounded-xl p-6 mb-6">
            <h3 className="text-sm text-gray-300 mb-4">
              Circular Progress Preview
            </h3>

            <div className="flex justify-center items-center">
              <div className="w-28 h-28 rounded-full border-[8px] border-[#22262e] flex items-center justify-center text-xl font-semibold text-white">
                {progress}%
              </div>
            </div>

            <div className="flex justify-between items-center text-sm mt-4">
              <span className="text-gray-300 flex items-center gap-2">
                👁 Show on card front
              </span>
              <input type="checkbox" className="accent-teal-400 h-4 w-4" />
            </div>
          </div>

          {/* ADVANCED SETTINGS */}
          <h3 className="text-sm text-gray-300 mb-4">Advanced Settings</h3>

          {/* Stroke Width */}
          <div className="flex justify-between text-sm mb-1">
            <span>Stroke Width</span>
            <span>{strokeWidth}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(e.target.value)}
            className="w-full mb-4"
            style={{ accentColor: "#2ec4b6" }}
          />

          {/* Progress Steps */}
          <div className="flex justify-between text-sm mb-1">
            <span>Progress Steps</span>
            <span>{progressSteps}</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={progressSteps}
            onChange={(e) => setProgressSteps(e.target.value)}
            className="w-full mb-4"
            style={{ accentColor: "#2ec4b6" }}
          />

          {/* Segment Gap */}
          <div className="flex justify-between text-sm mb-1">
            <span>Segment Gap</span>
            <span>{segmentGap}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            value={segmentGap}
            onChange={(e) => setSegmentGap(e.target.value)}
            className="w-full mb-6"
            style={{ accentColor: "#2ec4b6" }}
          />

          {/* STYLE SELECTOR */}
          <div className="flex justify-between">
            <button className="flex-1 py-2 bg-[#1a1d23] border border-[#2a2f37] rounded-md text-sm">
              Minimal
            </button>
            <button className="flex-1 py-2 mx-2 bg-teal-500/20 border border-teal-500 text-teal-300 rounded-md text-sm">
              Chunked
            </button>
            <button className="flex-1 py-2 bg-[#1a1d23] border border-[#2a2f37] rounded-md text-sm">
              Bold
            </button>
          </div>

          {/* SMART SYNC */}
          <div className="mt-6 bg-[#0e0f13] border border-[#2a2f37] rounded-xl p-4">
            <h3 className="text-sm text-gray-300 mb-2">
              🔄 Smart Progress Sync
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Automatically update progress based on time spent and checklist
              completion.
            </p>
            <div className="flex justify-between items-center">
              <span className="text-xs text-teal-300">
                Progress synced 2 minutes ago
              </span>
              <input type="checkbox" className="accent-teal-400 h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
