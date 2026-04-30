import React, { useState } from "react";
import { useSettings, useApiKey } from "@/storage/context";
import { removeApiKey, removePrompt } from "@/storage/manager";
import { PROMPT_DEFAULTS } from "@/prompts/defaults";
import type { AiProviderConfig } from "@/storage/types";
import { clearCtiHistory, getCtiHistory } from "@/background/cti-history";
import { exportHistoryAsCsv } from "@/modules/cti/csv";
import { clearAnalysisHistory } from "@/modules/analysis/history";
import type {
  AiTestConnectionResponse,
} from "@/background/ai-types";

// AI provider API keys are namespaced by provider UUID (apikeys.ai.<id>)
// so two providers of the same type (e.g. two OpenAI accounts) hold distinct keys.

async function requestEndpointPermission(endpoint: string): Promise<boolean> {
  const trimmed = endpoint.trim();
  if (trimmed === "") return true;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    const origin = `${url.protocol}//${url.host}/*`;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

interface SectionProps {
  title: string;
  id: string;
  openSection: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  id,
  openSection,
  onToggle,
  children,
}) => (
  <div className="border border-gray-700 rounded mb-3">
    <button
      onClick={() => onToggle(id)}
      className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-800 transition-colors"
    >
      <h3 className="font-semibold text-gray-100">{title}</h3>
      <span className="text-gray-400">{openSection === id ? "−" : "+"}</span>
    </button>
    {openSection === id && (
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-850">
        {children}
      </div>
    )}
  </div>
);

const DETECTOR_PLACEHOLDERS = [
  "IPv4",
  "IPv6",
  "Email",
  "FQDN",
  "AWS Access Key",
  "GitHub Token",
  "JWT",
  "Bearer Token",
  "Private Key Block",
  "MAC Address",
  "User Path",
  "UUID / High Entropy",
];

const REDACTION_FEATURE_IDS = ["log-analysis", "redaction-ai"];

const MODEL_PLACEHOLDERS: Record<AiProviderConfig["type"], string> = {
  ollama: "llama3.2",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  "openai-compatible": "Model name",
};

export const SettingsComponent: React.FC = () => {
  const [settings, updateSettings, settingsLoading] = useSettings();
  const [openSection, setOpenSection] = useState<string | null>(
    "ai-providers",
  );
  const [newProviderType, setNewProviderType] = useState<AiProviderConfig["type"]>("ollama");

  if (settingsLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Loading settings...</p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const addAiProvider = async () => {
    const id = crypto.randomUUID();
    const newProvider: AiProviderConfig = {
      id,
      type: newProviderType,
      label: `${newProviderType} provider`,
      endpoint: "http://localhost:11434",
    };
    await updateSettings({
      aiProviders: [...settings.aiProviders, newProvider],
    });
  };

  const removeAiProvider = async (id: string) => {
    await updateSettings({
      aiProviders: settings.aiProviders.filter((p) => p.id !== id),
    });
    // Also remove the API key if it exists
    await removeApiKey(`ai.${id}`);
  };

  const updateAiProvider = async (
    id: string,
    updates: Partial<AiProviderConfig>,
  ) => {
    const updated = settings.aiProviders.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    await updateSettings({ aiProviders: updated });
  };

  const setDefaultAiProvider = async (providerId: string | undefined) => {
    await updateSettings({ defaultAiProviderId: providerId });
  };

  const toggleDetector = async (detectorId: string) => {
    const current = settings.redactionDetectors[detectorId] ?? true;
    await updateSettings({
      redactionDetectors: {
        ...settings.redactionDetectors,
        [detectorId]: !current,
      },
    });
  };


  const sectionProps = { openSection, onToggle: toggleSection };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {/* AI Providers */}
      <Section title="AI Providers" id="ai-providers" {...sectionProps}>
        <div className="space-y-3">
          {settings.aiProviders.length === 0 ? (
            <p className="text-sm text-gray-400">No AI providers configured.</p>
          ) : (
            <div className="space-y-2">
              {settings.aiProviders.map((provider) => (
                <AiProviderCard
                  key={provider.id}
                  provider={provider}
                  isDefault={settings.defaultAiProviderId === provider.id}
                  onUpdate={(updates) => updateAiProvider(provider.id, updates)}
                  onRemove={() => removeAiProvider(provider.id)}
                  onSetDefault={(checked) =>
                    setDefaultAiProvider(checked ? provider.id : undefined)
                  }
                />
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <select
              value={newProviderType}
              onChange={(e) =>
                setNewProviderType(
                  e.target.value as AiProviderConfig["type"],
                )
              }
              className="flex-1 bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm"
            >
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
            <button
              onClick={addAiProvider}
              className="px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800"
            >
              Add Provider
            </button>
          </div>
        </div>
      </Section>

      {/* API Keys */}
      <Section title="API Keys" id="api-keys" {...sectionProps}>
        <div className="space-y-3">
          {/* VirusTotal */}
          <ApiKeyField
            label="VirusTotal"
            provider="virustotal"
            hint="Get from virustotal.com/settings/api"
          />
          {/* AbuseIPDB */}
          <ApiKeyField
            label="AbuseIPDB"
            provider="abuseipdb"
            hint="Get from abuseipdb.com/account/api"
          />
          {/* abuse.ch */}
          <ApiKeyField
            label="abuse.ch"
            provider="abusech"
            hint="Optional for API mode (web request mode uses no key)"
          />
          <AbusechModeField />
        </div>
      </Section>

      {/* System Prompts */}
      <Section title="System Prompts" id="system-prompts" {...sectionProps}>
        <div className="space-y-4">
          {REDACTION_FEATURE_IDS.map((featureId) => (
            <PromptField key={featureId} featureId={featureId} />
          ))}
        </div>
      </Section>

      {/* Log Analysis */}
      <Section title="Log Analysis" id="log-analysis-settings" {...sectionProps}>
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            History keeps the last 10 analyses (input + AI response + provider).
            Clearing wipes the store in one operation.
          </p>
          <button
            onClick={async () => {
              if (
                window.confirm(
                  "Clear all log analysis history? This wipes stored AI responses for previous runs.",
                )
              ) {
                await clearAnalysisHistory();
              }
            }}
            className="px-3 py-1 bg-red-900 text-red-100 rounded text-xs hover:bg-red-800"
          >
            Clear log analysis history
          </button>
        </div>
      </Section>

      {/* CTI Settings */}
      <Section title="CTI Settings" id="cti-settings" {...sectionProps}>
        <div className="space-y-2">
          <label className="text-sm text-gray-300 block">
            Cache TTL (hours)
          </label>
          <input
            type="number"
            min="1"
            max="2160"
            value={settings.ctiTtlHours}
            onChange={(e) =>
              updateSettings({ ctiTtlHours: parseInt(e.target.value, 10) })
            }
            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Entries older than this are marked stale. Click a stale entry to
            refresh.
          </p>
          <div className="pt-2 mt-2 border-t border-gray-700 flex gap-2">
            <button
              onClick={async () => {
                const entries = await getCtiHistory();
                if (entries.length === 0) return;
                exportHistoryAsCsv(entries);
              }}
              className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-100 rounded text-xs hover:bg-gray-700"
            >
              Export CSV
            </button>
            <button
              onClick={async () => {
                if (
                  window.confirm(
                    "Clear all CTI history? This wipes both the audit log and cached responses.",
                  )
                ) {
                  await clearCtiHistory();
                }
              }}
              className="px-3 py-1 bg-red-900 text-red-100 rounded text-xs hover:bg-red-800"
            >
              Clear CTI history
            </button>
          </div>
        </div>
      </Section>

      {/* Redaction Detectors */}
      <Section title="Redaction Detectors" id="redaction-detectors" {...sectionProps}>
        <div className="space-y-2">
          {DETECTOR_PLACEHOLDERS.map((detector) => (
            <label
              key={detector}
              className="text-sm text-gray-300 flex items-center gap-2"
            >
              <input
                type="checkbox"
                checked={
                  settings.redactionDetectors[detector.toLowerCase()] ?? true
                }
                onChange={() => toggleDetector(detector.toLowerCase())}
              />
              {detector}
            </label>
          ))}
        </div>
      </Section>

      {/* Right-Click Actions */}
      <Section title="Right-Click Actions" id="context-menu-actions" {...sectionProps}>
        <div className="text-sm text-gray-400">
          <p>No modules configured for right-click access yet.</p>
          <p className="text-xs mt-2">
            Modules can opt into context-menu integration in settings here once
            they declare it.
          </p>
        </div>
      </Section>
    </div>
  );
};

interface AiProviderCardProps {
  provider: AiProviderConfig;
  isDefault: boolean;
  onUpdate: (updates: Partial<AiProviderConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  onSetDefault: (checked: boolean) => Promise<void>;
}

const AiProviderCard: React.FC<AiProviderCardProps> = ({
  provider,
  isDefault,
  onUpdate,
  onRemove,
  onSetDefault,
}) => {
  const [endpointDraft, setEndpointDraft] = useState(provider.endpoint);
  const [testStatus, setTestStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [keyApiKey, setKeyApiKey, keyLoading] = useApiKey(`ai.${provider.id}`);
  const [keyDraft, setKeyDraft] = useState(keyApiKey ?? "");
  const [showKey, setShowKey] = useState(false);

  React.useEffect(() => {
    setEndpointDraft(provider.endpoint);
  }, [provider.endpoint]);

  React.useEffect(() => {
    setKeyDraft(keyApiKey ?? "");
  }, [keyApiKey]);

  const requiresKey =
    provider.type === "openai" || provider.type === "anthropic";
  const acceptsKey =
    requiresKey || provider.type === "openai-compatible";

  const handleEndpointBlur = async (): Promise<void> => {
    if (endpointDraft === provider.endpoint) {
      // No change.
      if (endpointDraft.trim() !== "") {
        void requestEndpointPermission(endpointDraft);
      }
      return;
    }
    await onUpdate({ endpoint: endpointDraft });
    if (endpointDraft.trim() !== "") {
      void requestEndpointPermission(endpointDraft);
    }
  };

  const handleSaveKey = async (): Promise<void> => {
    if (keyDraft.trim()) {
      await setKeyApiKey(keyDraft);
    } else if (keyApiKey) {
      await removeApiKey(`ai.${provider.id}`);
    }
  };

  const handleTest = async (): Promise<void> => {
    setTestStatus({ kind: "running" });
    const granted = await requestEndpointPermission(endpointDraft);
    if (!granted) {
      setTestStatus({
        kind: "error",
        message: "Permission denied for endpoint origin.",
      });
      return;
    }
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "ai.test-connection",
        providerId: provider.id,
      })) as AiTestConnectionResponse | undefined;
      if (!response) {
        setTestStatus({
          kind: "error",
          message: "No response from service worker.",
        });
        return;
      }
      if (response.ok) {
        setTestStatus({ kind: "ok", message: response.message });
      } else {
        setTestStatus({ kind: "error", message: response.error });
      }
    } catch (err) {
      setTestStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="border border-gray-700 rounded p-2 bg-gray-800">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={provider.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Provider name"
            className="flex-1 min-w-0 bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm"
          />
          <select
            value={provider.type}
            onChange={(e) =>
              onUpdate({
                type: e.target.value as AiProviderConfig["type"],
              })
            }
            className="bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm"
          >
            <option value="ollama">Ollama</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </div>
        <input
          type="text"
          value={endpointDraft}
          onChange={(e) => setEndpointDraft(e.target.value)}
          onBlur={handleEndpointBlur}
          placeholder="http://localhost:11434"
          className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm"
        />
        <input
          type="text"
          value={provider.model ?? ""}
          onChange={(e) => onUpdate({ model: e.target.value })}
          placeholder={MODEL_PLACEHOLDERS[provider.type]}
          className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm"
        />
        {acceptsKey && (
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={
                  requiresKey
                    ? "API key (required)"
                    : "API key (optional for self-hosted)"
                }
                disabled={keyLoading}
                className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-2 py-1 pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide" : "Show"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs"
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
            <button
              onClick={handleSaveKey}
              disabled={keyLoading}
              className="px-2 py-1 bg-gray-700 text-gray-100 rounded text-xs hover:bg-gray-600 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="text-xs text-gray-400 flex items-center gap-1">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => onSetDefault(e.target.checked)}
          />
          Default provider
        </label>
        <div className="flex gap-1">
          <button
            onClick={handleTest}
            disabled={testStatus.kind === "running"}
            className="px-2 py-1 bg-blue-900 text-blue-100 rounded text-xs hover:bg-blue-800 disabled:opacity-50"
          >
            {testStatus.kind === "running" ? "Testing…" : "Test"}
          </button>
          <button
            onClick={onRemove}
            className="px-2 py-1 bg-red-900 text-red-100 rounded text-xs hover:bg-red-800"
          >
            Remove
          </button>
        </div>
      </div>
      {testStatus.kind === "ok" && (
        <p className="mt-1 text-xs text-emerald-400 break-words">
          ✓ {testStatus.message}
        </p>
      )}
      {testStatus.kind === "error" && (
        <p className="mt-1 text-xs text-red-300 break-words">
          ✗ {testStatus.message}
        </p>
      )}
    </div>
  );
};

interface ApiKeyFieldProps {
  label: string;
  provider: string;
  hint: string;
}

const ApiKeyField: React.FC<ApiKeyFieldProps> = ({
  label,
  provider,
  hint,
}) => {
  const [apiKey, setApiKeyValue, loading] = useApiKey(provider);
  const [showKey, setShowKey] = useState(false);
  const [tempValue, setTempValue] = useState(apiKey ?? "");

  React.useEffect(() => {
    setTempValue(apiKey ?? "");
  }, [apiKey]);

  const handleSave = async () => {
    if (tempValue.trim()) {
      await setApiKeyValue(tempValue);
    } else if (apiKey) {
      await removeApiKey(provider);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-sm text-gray-300 block">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={`Paste ${label} API key`}
            disabled={loading}
            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 pr-8 text-sm"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 flex items-center justify-center"
            title={showKey ? "Hide" : "Show"}
            type="button"
          >
            {showKey ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0c0 1.657-.672 3.157-1.757 4.243A6 6 0 0121 12a9 9 0 00-1.5-5.009m0 0A9 9 0 003 12m18 0a9 9 0 01-18 0"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-2 py-1 bg-gray-700 text-gray-100 rounded text-xs hover:bg-gray-600 disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-gray-500">{hint}</p>
    </div>
  );
};

const AbusechModeField: React.FC = () => {
  const [settings, updateSettings] = useSettings();
  const [apiKey] = useApiKey("abusech");
  if (!settings) return null;
  const mode = settings.abusechMode;
  const apiSelectedWithoutKey = mode === "api" && !apiKey;
  return (
    <div className="space-y-1">
      <label className="text-sm text-gray-300 block">abuse.ch mode</label>
      <div className="flex gap-3 text-sm text-gray-300">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="abusech-mode"
            value="web"
            checked={mode === "web"}
            onChange={() => updateSettings({ abusechMode: "web" })}
          />
          Web request (no key)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="abusech-mode"
            value="api"
            checked={mode === "api"}
            onChange={() => updateSettings({ abusechMode: "api" })}
          />
          API key
        </label>
      </div>
      {apiSelectedWithoutKey && (
        <p className="text-xs text-amber-400">
          API mode selected but no key saved — abuse.ch lookups will be skipped.
        </p>
      )}
    </div>
  );
};

interface PromptFieldProps {
  featureId: string;
}

const PromptField: React.FC<PromptFieldProps> = ({ featureId }) => {
  const [prompt, setPrompt] = useState(
    PROMPT_DEFAULTS[featureId] ?? "",
  );
  const [isCustom, setIsCustom] = useState(false);

  React.useEffect(() => {
    const loadPrompt = async () => {
      const { getPrompt } = await import("@/storage/manager");
      const stored = await getPrompt(featureId);
      if (stored) {
        setPrompt(stored);
        setIsCustom(true);
      } else {
        setPrompt(PROMPT_DEFAULTS[featureId] ?? "");
        setIsCustom(false);
      }
    };
    loadPrompt();
  }, [featureId]);

  const handleChange = async (value: string) => {
    setPrompt(value);
    const { setPrompt: setStoragePrompt } = await import(
      "@/storage/manager"
    );
    if (value.trim()) {
      await setStoragePrompt(featureId, value);
      setIsCustom(true);
    }
  };

  const handleReset = async () => {
    await removePrompt(featureId);
    setPrompt(PROMPT_DEFAULTS[featureId] ?? "");
    setIsCustom(false);
  };

  const label = featureId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300">{label}</label>
        {isCustom && (
          <button
            onClick={handleReset}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Reset to default
          </button>
        )}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={`Paste custom system prompt for ${label}`}
        rows={4}
        className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-gray-500"
      />
      <p className="text-xs text-gray-500">
        {isCustom ? "Custom prompt active" : "Using default prompt"}
      </p>
    </div>
  );
};
