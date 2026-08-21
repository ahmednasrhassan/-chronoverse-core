"use client";

import React, { useState } from "react";

interface CommentItem {
  _id: string;
  name: string;
  comment: string;
  _createdAt: string;
}

export default function ExecutiveDiscussion({
  postId,
  comments = [],
}: {
  postId: string;
  comments?: CommentItem[];
}) {
  const [formData, setFormData] = useState({ name: "", email: "", comment: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, postId }),
      });

      if (res.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", comment: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="mt-16 border-t border-zinc-800/80 pt-10">
      <div className="flex items-center gap-2 mb-6 text-zinc-100 font-semibold tracking-wide uppercase text-sm">
        <span>💬</span>
        <h3>Executive Discussion ({comments.length})</h3>
      </div>

      <div className="space-y-4 mb-10">
        {comments.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No institutional remarks recorded yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c._id} className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-500/90 font-mono">{c.name}</span>
                <span className="text-[10px] text-zinc-600 font-mono">
                  {new Date(c._createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed font-sans">{c.comment}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-950/60 p-6 border border-zinc-800/70 rounded-md">
        <h4 className="text-xs uppercase tracking-wider text-zinc-400 font-mono mb-2">
          Submit Analytical Feedback
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            required
            placeholder="Full Name / Designation"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 rounded"
          />
          <input
            type="email"
            required
            placeholder="Institutional Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 rounded"
          />
        </div>

        <textarea
          required
          rows={3}
          placeholder="Share your structured insights or critical inquiry..."
          value={formData.comment}
          onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 rounded resize-none"
        />

        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-zinc-500 font-mono">
            {status === "success" && <span className="text-emerald-400">✓ Submitted for moderation review.</span>}
            {status === "error" && <span className="text-rose-400">✕ Submission failed. Try again.</span>}
            {status === "idle" && "Submissions undergo editorial moderation."}
          </p>
          <button
            type="submit"
            disabled={status === "loading"}
            className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition uppercase tracking-wider rounded disabled:opacity-50"
          >
            {status === "loading" ? "Submitting..." : "Post Remark"}
          </button>
        </div>
      </form>
    </section>
  );
}