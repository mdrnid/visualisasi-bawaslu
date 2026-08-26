const browserGlobals = {
    window: 'readonly', document: 'readonly', console: 'readonly', fetch: 'readonly',
    location: 'readonly', history: 'readonly', navigator: 'readonly',
    URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly',
    sessionStorage: 'readonly', localStorage: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
    clearInterval: 'readonly', requestAnimationFrame: 'readonly',
    Image: 'readonly', IntersectionObserver: 'readonly', HTMLElement: 'readonly',
    TextEncoder: 'readonly', TextDecoder: 'readonly', AbortController: 'readonly',
    btoa: 'readonly', atob: 'readonly',
    XLSX: 'readonly', Chart: 'readonly', // dimuat dari CDN sebagai global
};

const nodeGlobals = {
    process: 'readonly', console: 'readonly', Buffer: 'readonly',
    __dirname: 'readonly', __filename: 'readonly',
    module: 'writable', require: 'readonly', exports: 'writable',
    URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
};

const sharedRules = {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',
    eqeqeq: ['error', 'smart'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-implicit-coercion': 'warn',
};

export default [
    { ignores: ['node_modules/**', 'coverage/**', 'data/**'] },
    {
        files: ['assets/js/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browserGlobals },
        rules: sharedRules,
    },
    {
        files: ['server.js', 'scripts/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...nodeGlobals, ...browserGlobals } },
        rules: sharedRules,
    },
    {
        files: ['scripts/**/*.mjs', 'tests/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
        rules: sharedRules,
    },
];
