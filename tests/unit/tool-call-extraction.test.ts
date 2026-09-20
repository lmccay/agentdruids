/**
 * Tool Call Extraction Tests
 *
 * Agents emit tool calls as `TOOL_CALL:` followed by a JSON object. Models wrap
 * that JSON in markdown unprompted — fenced blocks, bold, inline code — and
 * which ones they use varies by model, so it cannot be prevented by instruction.
 *
 * The extractor previously sliced from immediately after `TOOL_CALL:`, so any
 * wrapper went to JSON.parse:
 *
 *   SyntaxError: Unexpected token '*', "**\n```json"... is not valid JSON
 *
 * A dropped call is silent: the agent's structured intent is lost, nothing
 * retries it, and the model improvises onward. In the run that surfaced this, a
 * coordinator lost two delegations and still reported success — so the tests
 * that matter most are the wrapped forms, and the one asserting that prose
 * containing a stray brace is *not* mistaken for a call.
 */

import { extractToolCalls } from '../../src/services/AgentService';

const CALL = '{"tool": "delegate_task", "params": {"target_agent": "reddit-elemental"}}';

describe('extractToolCalls', () => {
  describe('the plain form', () => {
    it('extracts a bare tool call', () => {
      const calls = extractToolCalls(`TOOL_CALL: ${CALL}`);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.json)).toMatchObject({ tool: 'delegate_task' });
    });

    it('extracts several from one response', () => {
      const calls = extractToolCalls(`TOOL_CALL: ${CALL}\nthen\nTOOL_CALL: ${CALL}`);
      expect(calls).toHaveLength(2);
    });

    it('handles a newline between the prefix and the brace', () => {
      expect(extractToolCalls(`TOOL_CALL:\n${CALL}`)).toHaveLength(1);
    });
  });

  describe('markdown-wrapped forms — the defect', () => {
    // Each of these previously threw at JSON.parse and silently dropped the call.
    const wrapped: Array<[string, string]> = [
      ['fenced json block', 'TOOL_CALL:\n```json\n' + CALL + '\n```'],
      ['bare fence', 'TOOL_CALL:\n```\n' + CALL + '\n```'],
      ['bold then fence — the observed failure', 'TOOL_CALL: **\n```json\n' + CALL + '\n```'],
      ['bold wrapper', `TOOL_CALL: **${CALL}**`],
      ['inline code', 'TOOL_CALL: `' + CALL + '`'],
      ['tilde fence', 'TOOL_CALL:\n~~~json\n' + CALL + '\n~~~'],
      ['uppercase fence tag', 'TOOL_CALL:\n```JSON\n' + CALL + '\n```'],
    ];

    it.each(wrapped)('extracts parseable JSON from a %s', (_label, response) => {
      const calls = extractToolCalls(response);
      expect(calls).toHaveLength(1);
      expect(() => JSON.parse(calls[0]!.json)).not.toThrow();
      expect(JSON.parse(calls[0]!.json)).toMatchObject({ tool: 'delegate_task' });
    });

    it('consumes the trailing fence so it is not left orphaned in the response', () => {
      // `raw` is what gets replaced by the tool result; leaving ``` behind would
      // corrupt the transcript the model then reads back.
      const response = 'before TOOL_CALL:\n```json\n' + CALL + '\n``` after';
      const [call] = extractToolCalls(response);
      const remaining = response.replace(call!.raw, 'TOOL_RESULT: ok');
      expect(remaining).toBe('before TOOL_RESULT: ok after');
      expect(remaining).not.toContain('```');
    });
  });

  describe('braces inside arguments', () => {
    it('does not stop at a brace inside a string', () => {
      // Delegated tasks carry briefs, which routinely contain braces.
      const withBraces = '{"tool": "delegate_task", "params": {"task": "use {placeholder} here"}}';
      const [call] = extractToolCalls(`TOOL_CALL: ${withBraces}`);
      expect(JSON.parse(call!.json).params.task).toBe('use {placeholder} here');
    });

    it('does not stop at an escaped quote', () => {
      const escaped = '{"tool": "delegate_task", "params": {"task": "say \\"hi\\" then {x}"}}';
      const [call] = extractToolCalls(`TOOL_CALL: ${escaped}`);
      expect(JSON.parse(call!.json).params.task).toBe('say "hi" then {x}');
    });

    it('handles a large nested argument', () => {
      const brief = 'x'.repeat(2000);
      const big = `{"tool": "delegate_task", "params": {"task": "${brief}", "nested": {"a": {"b": 1}}}}`;
      const [call] = extractToolCalls(`TOOL_CALL:\n\`\`\`json\n${big}\n\`\`\``);
      expect(JSON.parse(call!.json).params.task).toHaveLength(2000);
    });
  });

  describe('things that are not tool calls', () => {
    it('ignores the marker in prose with no JSON after it', () => {
      expect(extractToolCalls('I would use TOOL_CALL: but I have no arguments.')).toEqual([]);
    });

    it('does not scan ahead to an unrelated brace', () => {
      // The wrapper vocabulary is deliberately narrow. Without that, this would
      // capture a brace from unrelated prose far below.
      const response = 'TOOL_CALL: none needed.\n\nLater I might write {"tool": "x"} as an example.';
      expect(extractToolCalls(response)).toEqual([]);
    });

    it('ignores an unterminated object', () => {
      expect(extractToolCalls('TOOL_CALL: {"tool": "delegate_task"')).toEqual([]);
    });

    it('returns nothing for a response with no marker', () => {
      expect(extractToolCalls('Here is my analysis, no tools required.')).toEqual([]);
    });
  });

  describe('replacement span', () => {
    it('raw covers the marker through the closing brace', () => {
      const response = `before TOOL_CALL: ${CALL} after`;
      const [call] = extractToolCalls(response);
      expect(call!.raw.startsWith('TOOL_CALL:')).toBe(true);
      expect(call!.raw.endsWith('}')).toBe(true);
      expect(response.replace(call!.raw, 'R')).toBe('before R after');
    });

    it('index points at the marker', () => {
      const response = `xx TOOL_CALL: ${CALL}`;
      const [call] = extractToolCalls(response);
      expect(response.slice(call!.index, call!.index + 10)).toBe('TOOL_CALL:');
    });
  });
});
