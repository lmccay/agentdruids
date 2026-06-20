/**
 * WorldTree conversational prompts for the MCP surface (Phase A).
 *
 * MCP "prompts" are pre-canned conversational starters a client offers the user
 * without them composing tool calls by hand. These are sugar — each expands to
 * a natural-language instruction that drives the existing WorldTree tools.
 *
 * See docs/phase-a-worldtree-discovery.md.
 */

interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  /** Builds the expanded user-message text from validated args. */
  template: (args: Record<string, string>) => string;
}

const PROMPTS: PromptDefinition[] = [
  {
    name: 'recap_agent',
    description: "Summarize an agent's recent work in the WorldTree.",
    arguments: [
      { name: 'agentId', description: 'The agent to recap', required: true },
      { name: 'days', description: 'How many days back to look (default 30)', required: false },
    ],
    template: (args) => {
      const days = args['days'] ?? '30';
      return [
        `Summarize the recent work of agent "${args['agentId']}" over the last ${days} days.`,
        `Use the agent_activity tool with agentId="${args['agentId']}" and an appropriate "since" timestamp,`,
        `and search_contributions if you need more detail. Report what the agent worked on, how often,`,
        `and any notable patterns in its contributions.`,
      ].join(' ');
    },
  },
  {
    name: 'compare_two_sessions',
    description: 'Compare two coordination sessions side by side.',
    arguments: [
      { name: 'sessionIdA', description: 'First session id', required: true },
      { name: 'sessionIdB', description: 'Second session id', required: true },
    ],
    template: (args) =>
      [
        `Compare coordination sessions "${args['sessionIdA']}" and "${args['sessionIdB']}".`,
        `Use the compare_sessions tool with sessionIdA="${args['sessionIdA']}" and sessionIdB="${args['sessionIdB']}".`,
        `Summarize how their prompts differ, which agent roles participated in each, and how their`,
        `contribution counts compare.`,
      ].join(' '),
  },
  {
    name: 'find_similar_work',
    description: 'Find past sessions whose prompt resembles a given prompt (text match).',
    arguments: [{ name: 'prompt', description: 'The prompt or topic to find similar work for', required: true }],
    template: (args) =>
      [
        `Find past coordination sessions similar to: "${args['prompt']}".`,
        `Use find_sessions_by_prompt with text drawn from the key terms of that prompt.`,
        `Summarize what those sessions had in common and what was produced.`,
        `(Note: this is text matching only; semantic similarity is a later phase.)`,
      ].join(' '),
  },
  {
    name: 'worldtree_health',
    description: 'Sanity-check the WorldTree: session counts, agent activity, mode distribution.',
    arguments: [],
    template: () =>
      [
        `Give me a health summary of the WorldTree.`,
        `Read the worldtree://modes resource and use list_sessions and aggregate_contributions`,
        `(grouped by agent_role and by day) to report total sessions, sessions by status,`,
        `the most active agents, the distribution of publishing modes, and how many sessions`,
        `have outcome metrics attached.`,
      ].join(' '),
  },
];

const PROMPTS_BY_NAME = new Map(PROMPTS.map((p) => [p.name, p]));

/** Definitions for `prompts/list` (without the template function). */
export const WORLDTREE_PROMPT_DEFINITIONS = PROMPTS.map(({ name, description, arguments: args }) => ({
  name,
  description,
  arguments: args,
}));

export const WORLDTREE_PROMPT_NAMES: ReadonlySet<string> = new Set(PROMPTS.map((p) => p.name));

/**
 * Expand a prompt for `prompts/get`. Returns the MCP prompt payload, or null if
 * the name is unknown. Throws if a required argument is missing.
 */
export function getWorldTreePrompt(
  name: string,
  args: Record<string, string> = {}
): { description: string; messages: Array<{ role: string; content: { type: string; text: string } }> } | null {
  const prompt = PROMPTS_BY_NAME.get(name);
  if (!prompt) return null;

  for (const arg of prompt.arguments) {
    if (arg.required && !args[arg.name]) {
      throw new Error(`Missing required argument: ${arg.name}`);
    }
  }

  return {
    description: prompt.description,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: prompt.template(args) },
      },
    ],
  };
}
