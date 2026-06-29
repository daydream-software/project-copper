// Flat ESLint config built on eslint-config-love (strict TypeScript rules) to keep
// the codebase clean as it grows. We KEEP every bug-catching / type-safety rule
// (and fix the code to satisfy it). The only rules turned off are pure-style or
// genuinely ill-suited to a tiny, dependency-free Canvas game. Run `npm run lint`.
import love from 'eslint-config-love'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.d.ts'] },
  {
    ...love,
    files: ['src/**/*.ts'],
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // --- Off: genuinely ill-suited to a Canvas/geometry game ---
      'no-bitwise': 'off', //                          the PRNG does real bit math (mulberry32)
      '@typescript-eslint/no-magic-numbers': 'off', // layout/draw/physics constants are inline by design

      // --- Configured: keep the value, fit the game ---
      // Enforce the clean destructuring case (`const { x } = obj`) but NOT renamed
      // access — `let vx = vel.x` reads better than `let { x: vx } = vel`.
      '@typescript-eslint/prefer-destructuring': [
        'error',
        { VariableDeclarator: { array: false, object: true } },
        { enforceForRenamedProperties: false },
      ],
      'no-console': 'error', //                        no stray logging in the sim/view
      'require-unicode-regexp': ['error', { requireFlag: 'u' }],
      '@typescript-eslint/max-params': ['error', { max: 8 }], // canvas draw fns take many positional coords
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
    },
  },
  {
    // The renderer is a pure Canvas drawing module: every function is handed the
    // 2D `ctx` and configures it (ctx.strokeStyle/lineWidth/… = …). That IS the
    // Canvas API — there is no immutable form — so prop-mutation of the ctx param
    // is expected here (and only here). Rebinding a param is still forbidden.
    files: ['src/render.ts'],
    rules: { 'no-param-reassign': ['error', { props: false }] },
  },
  {
    // Tests may use non-null assertions and looser typing for fixtures.
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
]
