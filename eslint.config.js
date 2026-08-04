export default [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        location: "readonly",
        history: "readonly",
        console: "readonly",
        Blob: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        Chart: "readonly",
        XLSX: "readonly",
        process: "readonly",
        Buffer: "readonly",
        atob: "readonly",
        btoa: "readonly",
        escape: "readonly",
        unescape: "readonly",
        encodeURIComponent: "readonly",
        decodeURIComponent: "readonly",
        Date: "readonly",
        Number: "readonly",
        String: "readonly",
        Set: "readonly",
        Map: "readonly",
        Math: "readonly",
        Array: "readonly",
        JSON: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "eqeqeq": ["error", "always"]
    }
  }
];
