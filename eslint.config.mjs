import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_ROLE_COMPARISON = [
  {
    selector: "BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(it|manager|user)$/]",
    message: "Do not compare role strings. Ask hasCapability()/canActOn() in src/server/auth/permissions.ts.",
  },
  {
    selector: "BinaryExpression[operator=/^[!=]==?$/] > MemberExpression[object.name='ROLE']",
    message: "Do not branch on a role. Add a capability to ROLE_POLICIES (src/domain/roles.ts) and check it instead.",
  },
  {
    selector: "SwitchCase > MemberExpression[object.name='ROLE']",
    message: "Do not switch on a role. Add a capability to ROLE_POLICIES (src/domain/roles.ts) and check it instead.",
  },
];

const SERVER_IMPORTS = {
  group: ["@/server/*", "@/server/**"],
  message: "Client code must not import server modules. Call the API through src/lib/api-client.ts.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-restricted-syntax": ["error", ...NO_ROLE_COMPARISON],
    },
  },
  // Boundaries: what may import what.
  {
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["next", "next/*", "react", "react-dom"], message: "src/domain is framework-free TypeScript." },
          { group: ["@/server/*", "@/server/**", "@/app/*", "@/app/**", "@/components/*", "@/components/**", "@/lib/*", "@/lib/**"], message: "src/domain imports nothing from the app." },
        ],
      }],
    },
  },
  {
    files: ["src/components/**", "src/lib/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [SERVER_IMPORTS] }] },
  },
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/db/*", "@/server/db/**"],
          message: "Pages and route handlers go through services (src/server/{auth,users,clients,demo}), never the store.",
        }],
      }],
    },
  },
  {
    files: ["src/server/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/app/*", "@/app/**", "@/components/*", "@/components/**", "@/lib/*", "@/lib/**"],
          message: "Server code must not depend on UI code.",
        }],
      }],
    },
  },
  {
    // The single place where roles are defined, and the seed that assigns them.
    files: ["src/domain/roles.ts", "src/server/db/seed-users.ts", "tests/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
