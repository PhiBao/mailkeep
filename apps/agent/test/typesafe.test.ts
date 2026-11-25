import { describe, expect, it, vi } from 'vitest';
import type { GatewayClient } from '../src/gateway/client.js';
import { systemOne } from '../src/providers/typesafe.js';

const questions = {
  kind: {
    type: 'choice',
    instructions: 'What kind of letter is this?',
    criteria: { bill: 'A bill', marketing: 'Marketing' },
  },
  scam_payment: { type: 'noul', instructions: 'Does it ask for gift cards?' },
};

function response(answers: Record<string, unknown>) {
  return {
    model: 'jev-test',
    answers,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function clientFor(payload: unknown): GatewayClient {
  return {
    request: vi.fn().mockResolvedValue({ json: payload }),
  } as unknown as GatewayClient;
}

describe('TypeSafe response validation', () => {
  it('accepts a complete response that matches the requested questions', async () => {
    const result = await systemOne(
      clientFor(
        response({
          kind: {
            type: 'choice',
            choice: 'bill',
            confidence: 0.99,
            probabilities: { bill: 0.99, marketing: 0.01 },
          },
          scam_payment: { type: 'noul', noul: 0.01 },
        }),
      ),
      {
        model: 'jev-test',
        state: {},
        questions,
      },
    );
    expect(result.answers.kind).toMatchObject({ choice: 'bill' });
  });

  it('rejects a partial response instead of treating missing safety answers as zero', async () => {
    await expect(
      systemOne(
        clientFor(
          response({
            kind: {
              type: 'choice',
              choice: 'marketing',
              confidence: 0.99,
              probabilities: { marketing: 0.99 },
            },
          }),
        ),
        {
          model: 'jev-test',
          state: {},
          questions,
        },
      ),
    ).rejects.toThrow('did not answer exactly the requested questions');
  });

  it('rejects an answer choice outside the requested criteria', async () => {
    await expect(
      systemOne(
        clientFor(
          response({
            kind: {
              type: 'choice',
              choice: 'not-a-kind',
              confidence: 0.99,
              probabilities: { 'not-a-kind': 0.99 },
            },
            scam_payment: { type: 'noul', noul: 0.01 },
          }),
        ),
        {
          model: 'jev-test',
          state: {},
          questions,
        },
      ),
    ).rejects.toThrow('answer choice did not match question kind');
  });

  it('rejects an answer with the wrong question type', async () => {
    await expect(
      systemOne(
        clientFor(
          response({
            kind: { type: 'noul', noul: 0.99 },
            scam_payment: { type: 'noul', noul: 0.01 },
          }),
        ),
        {
          model: 'jev-test',
          state: {},
          questions,
        },
      ),
    ).rejects.toThrow('answer type did not match question kind');
  });

  it('rejects probabilities for choices outside the requested criteria', async () => {
    await expect(
      systemOne(
        clientFor(
          response({
            kind: {
              type: 'choice',
              choice: 'bill',
              confidence: 0.99,
              probabilities: { bill: 0.98, invented: 0.02 },
            },
            scam_payment: { type: 'noul', noul: 0.01 },
          }),
        ),
        {
          model: 'jev-test',
          state: {},
          questions,
        },
      ),
    ).rejects.toThrow('answer probabilities did not match question kind');
  });

  it('rejects extra answers that were not requested', async () => {
    await expect(
      systemOne(
        clientFor(
          response({
            kind: {
              type: 'choice',
              choice: 'bill',
              confidence: 0.99,
              probabilities: { bill: 0.99 },
            },
            scam_payment: { type: 'noul', noul: 0.01 },
            invented: { type: 'noul', noul: 1 },
          }),
        ),
        {
          model: 'jev-test',
          state: {},
          questions,
        },
      ),
    ).rejects.toThrow('did not answer exactly the requested questions');
  });
});
