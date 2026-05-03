'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Channel {
  id: string;
  channelId: string;
  channelName: string;
  enabled: boolean;
  format: 'EMBED' | 'PLAIN' | 'COMPACT';
}

interface Connection {
  id: string;
  guildId: string;
  guildName: string;
  channels: Channel[];
}

interface AvailableChannel {
  id: string;
  name: string;
  parentId: string | null;
}

export default function IntegrationsPage() {
  const token = useAuth((s) => s.token);
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<Connection[]>('/discord/connections', { token }),
  });

  const handleConnect = async () => {
    const { url } = await api<{ url: string }>('/discord/auth-url', { token });
    window.location.href = url;
  };

  const discord = connections[0];

  const toggleChannel = useMutation({
    mutationFn: async ({ channelId }: { channelId: string }) => {
      if (!discord) return;
      const updated = discord.channels.map((c) =>
        c.channelId === channelId ? { ...c, enabled: !c.enabled } : c,
      );
      await api('/discord/channels', {
        method: 'POST',
        token,
        body: JSON.stringify({
          guildId: discord.guildId,
          channels: updated.map((c) => ({
            channelId: c.channelId,
            channelName: c.channelName,
            enabled: c.enabled,
            format: c.format,
          })),
        }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  });

  return (
    <div>
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to settings
      </Link>

      <h1 className="text-3xl font-medium tracking-tight mb-1">Integrations</h1>
      <p className="text-sm text-ink-muted mb-8">Auto-post your daily wrap to chat services</p>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : (
        <>
          <h2 className="text-xs font-semibold text-ink-muted tracking-wider mb-3">CONNECTED</h2>

          {discord ? (
            <div className="card border-success bg-success-bg mb-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-discord text-white rounded-lg flex items-center justify-center font-semibold">D</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Discord</div>
                  <div className="text-xs text-ink-muted">{discord.guildName} · {discord.channels.length} channels</div>
                </div>
                <button onClick={() => setPickerOpen(true)} className="btn btn-secondary !py-1.5 !px-3 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add channels
                </button>
              </div>

              <div className="space-y-1.5">
                {discord.channels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm"><span className="text-ink-muted">#</span> {ch.channelName}</div>
                      <div className="text-xs text-ink-muted">{ch.format === 'EMBED' ? 'Embed' : ch.format === 'PLAIN' ? 'Plain text' : 'Compact'}</div>
                    </div>
                    <button
                      onClick={() => toggleChannel.mutate({ channelId: ch.channelId })}
                      className={`relative w-9 h-5 rounded-full transition ${ch.enabled ? 'bg-success' : 'bg-ink-disabled'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition ${
                          ch.enabled ? 'right-0.5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={handleConnect} className="card hover:border-black/[0.15] transition w-full text-left mb-3 flex items-center gap-3">
              <div className="w-10 h-10 bg-discord text-white rounded-lg flex items-center justify-center font-semibold">D</div>
              <div className="flex-1">
                <div className="font-medium">Discord</div>
                <div className="text-xs text-ink-muted">Connect a server, post to multiple channels</div>
              </div>
              <span className="text-sm font-medium">+ Connect</span>
            </button>
          )}

          <h2 className="text-xs font-semibold text-ink-muted tracking-wider mb-3 mt-8">COMING SOON</h2>
          <div className="card flex items-center gap-3 opacity-60">
            <div className="w-10 h-10 bg-slack text-white rounded-lg flex items-center justify-center font-semibold">S</div>
            <div>
              <div className="font-medium">Slack</div>
              <div className="text-xs text-ink-muted">Multi-channel posting via incoming webhooks</div>
            </div>
          </div>
        </>
      )}

      {pickerOpen && discord && (
        <ChannelPicker
          guildId={discord.guildId}
          existingChannelIds={discord.channels.map((c) => c.channelId)}
          onClose={() => setPickerOpen(false)}
          onSaved={() => {
            setPickerOpen(false);
            queryClient.invalidateQueries({ queryKey: ['connections'] });
          }}
        />
      )}
    </div>
  );
}

function ChannelPicker({
  guildId,
  existingChannelIds,
  onClose,
  onSaved,
}: {
  guildId: string;
  existingChannelIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = useAuth((s) => s.token);
  const [selected, setSelected] = useState<Set<string>>(new Set(existingChannelIds));
  const [search, setSearch] = useState('');

  const { data: channels = [] } = useQuery({
    queryKey: ['available-channels', guildId],
    queryFn: () => api<AvailableChannel[]>(`/discord/channels?guildId=${guildId}`, { token }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const picked = channels.filter((c) => selected.has(c.id));
      await api('/discord/channels', {
        method: 'POST',
        token,
        body: JSON.stringify({
          guildId,
          channels: picked.map((c) => ({
            channelId: c.id,
            channelName: c.name,
            enabled: true,
            format: 'EMBED',
          })),
        }),
      });
    },
    onSuccess: onSaved,
  });

  const filtered = channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/[0.08]">
          <h3 className="font-medium mb-3">Pick channels</h3>
          <input
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((ch) => {
            const isSelected = selected.has(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => {
                  const next = new Set(selected);
                  next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                  setSelected(next);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition ${
                  isSelected ? 'bg-success-bg' : 'hover:bg-surface-alt'
                }`}
              >
                <span className="text-ink-muted">#</span>
                <span className="flex-1">{ch.name}</span>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'bg-success border-success' : 'border-ink-disabled'
                  }`}
                >
                  {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t border-black/[0.08] flex items-center gap-3">
          <span className="text-sm text-ink-muted">
            <strong className="text-ink">{selected.size}</strong> selected
          </span>
          <button onClick={onClose} className="btn btn-ghost ml-auto">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn btn-primary">
            {save.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
