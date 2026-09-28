# Graph Report - spot  (2026-09-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 181 nodes · 285 edges · 10 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a18d3706`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9

## God Nodes (most connected - your core abstractions)
1. `react-native` - 16 edges
2. `expo` - 14 edges
3. `useTheme()` - 9 edges
4. `ThemedText()` - 8 edges
5. `ThemedView()` - 8 edges
6. `Spacing` - 7 edges
7. `scripts` - 7 edges
8. `react` - 6 edges
9. `expo-image` - 5 edges
10. `expo-router` - 5 edges

## Surprising Connections (you probably didn't know these)
- `TabTwoScreen()` --calls--> `useTheme()`  [EXTRACTED]
  src/app/explore.tsx → src/hooks/use-theme.ts
- `ThemedText()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/themed-text.tsx → src/hooks/use-theme.ts
- `ThemedView()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/themed-view.tsx → src/hooks/use-theme.ts
- `Collapsible()` --calls--> `useTheme()`  [EXTRACTED]
  src/components/ui/collapsible.tsx → src/hooks/use-theme.ts

## Import Cycles
- None detected.

## Communities (10 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (30): expo, expo-device, expo-image, expo-symbols, react-native-safe-area-context, styles, TabTwoScreen(), getDevMenuHint() (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (18): expo-router, expo-splash-screen, react, react-native, react-native-reanimated, react-native-worklets, AnimatedIcon(), AnimatedSplashOverlay() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (25): dependencies, expo, expo-constants, expo-dev-client, expo-device, expo-font, expo-glass-effect, expo-image (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (21): projectId, reactCompiler, typedRoutes, expo, experiments, extra, icon, ios (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (21): devDependencies, @types/react, typescript, main, name, private, version, expo-constants (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (10): ref_fs, ref_path, ref_readline, exampleDirPath, fs, oldDirs, path, readline (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (5): expo-web-browser, styles, ExternalLink(), Props, MaxContentWidth

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (8): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, android

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (7): expo/tsconfig.base, compilerOptions, paths, strict, extends, include, @/assets/*

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

## Knowledge Gaps
- **102 isolated node(s):** `HintRowProps`, `ThemedTextProps`, `ThemedViewProps`, `Props`, `styles` (+97 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 117 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 2` to `Community 4`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `react-native` connect `Community 1` to `Community 0`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `scripts` connect `Community 9` to `Community 4`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `HintRowProps`, `ThemedTextProps`, `ThemedViewProps` to the rest of the system?**
  _102 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.12051282051282051 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09686609686609686 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._