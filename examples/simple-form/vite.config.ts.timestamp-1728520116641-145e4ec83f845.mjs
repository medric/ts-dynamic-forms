// vite.config.ts
import { defineConfig } from 'file:///Users/paloit/Desktop/ts-dynamic-forms/examples/simple-form/node_modules/vite/dist/node/index.js';
import react from 'file:///Users/paloit/Desktop/ts-dynamic-forms/examples/simple-form/node_modules/@vitejs/plugin-react/dist/index.mjs';
import tsconfigPaths from 'file:///Users/paloit/Desktop/ts-dynamic-forms/examples/simple-form/node_modules/vite-tsconfig-paths/dist/index.js';

// ../../packages/plugins/vite-plugin-generate-form-schema.ts
import { writeFileSync, watch } from 'fs';
import path from 'path';

// ../../packages/core/dynamic-form.ts
import * as swc from 'file:///Users/paloit/Desktop/ts-dynamic-forms/node_modules/@swc/core/index.js';

// ../../packages/core/utils.ts
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
function singularize(word) {
  const irregulars = {
    children: 'child',
    men: 'man',
    women: 'woman',
    feet: 'foot',
    teeth: 'tooth',
    mice: 'mouse',
    geese: 'goose',
    people: 'person',
  };
  if (irregulars[word.toLowerCase()]) {
    return irregulars[word.toLowerCase()];
  }
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  } else if (word.endsWith('ves')) {
    return word.slice(0, -3) + 'f';
  } else if (word.endsWith('es')) {
    return word.slice(0, -2);
  } else if (word.endsWith('s') && word.length > 1 && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}
function compose(...fns) {
  return fns.reduce(
    (f, g) =>
      (...args) =>
        f(g(...args))
  );
}

// ../../packages/core/dynamic-form.ts
var DynamicForm = class {
  constructor(config = { filename: './schema.ts' }) {
    this.forms = {};
    this.enums = {};
    this.TsKeywordType = this.tsKeywordTypeToForm.bind(this);
    this.TsArrayType = this.tsArrayTypeToForm.bind(this);
    this.TsTypeReference = this.tsTypeReferenceToForm.bind(this);
    this.config = config;
  }
  tsKeywordTypeToForm(type) {
    return { type: type.kind };
  }
  tsArrayTypeToForm(type, propertyName = '') {
    const elementType = type.elemType.type;
    let formType = 'unknown';
    if (elementType === 'TsTypeReference') {
      formType = this.tsTypeReferenceToForm(type.elemType).type;
    }
    if (elementType === 'TsKeywordType') {
      formType = `${this.tsKeywordTypeToForm(type.elemType)}`;
    }
    if (elementType === 'TsArrayType') {
      formType = this.tsArrayTypeToForm(type.elemType);
    }
    if (elementType === 'TsTypeLiteral') {
      const norm = compose(capitalizeFirstLetter, singularize);
      const inferredName =
        norm(propertyName) ?? `Inferred${Object.keys(this.forms).length}`;
      const form = this.tsLiteralTypeToForm(type.elemType);
      this.forms[inferredName] = form;
      formType = inferredName;
    }
    return { type: 'array', ref: formType };
  }
  tsTypeReferenceToForm(type) {
    if (type.typeName.type !== 'Identifier') {
      return { type: 'unknown' };
    }
    const isEnum = this.enums[type.typeName.value] !== void 0;
    if (isEnum) {
      return { type: 'enum', ref: type.typeName.value };
    }
    return { type: 'object', ref: type.typeName.type };
  }
  tsLiteralTypeToForm(literal) {
    const record = {};
    literal.members.forEach((member) => {
      const struct = member.type === 'TsPropertySignature' ? member : null;
      console.log(struct);
      if (!struct) {
        return;
      }
      const propertyName =
        struct.key.type === 'Identifier' ? struct.key.value : null;
      if (!propertyName) {
        return;
      }
      if (!struct.typeAnnotation) {
        return;
      }
      const { typeAnnotation } = struct;
      if (!typeAnnotation) {
        return;
      }
      const getFormDefinition =
        this[typeAnnotation.typeAnnotation.type] ?? (() => null);
      const propertyType = getFormDefinition(
        typeAnnotation.typeAnnotation,
        propertyName
      );
      if (!propertyType) {
        return;
      }
      record[propertyName] = propertyType;
    });
    return record;
  }
  typeDeclarationToForm(typeDeclaration) {
    const formName =
      typeDeclaration.id.type === 'Identifier'
        ? typeDeclaration.id.value
        : null;
    const isTypeLiteral =
      typeDeclaration.typeAnnotation.type === 'TsTypeLiteral';
    if (!isTypeLiteral || !formName) {
      return {};
    }
    const literal = typeDeclaration.typeAnnotation;
    const form = this.tsLiteralTypeToForm(literal);
    this.forms[formName] = form;
  }
  parseEnum(enumDeclaration) {
    const enumName =
      enumDeclaration.id.type === 'Identifier'
        ? enumDeclaration.id.value
        : null;
    if (!enumName) {
      return;
    }
    const enumValues = enumDeclaration.members
      .map((member) => {
        return member.id.type === 'Identifier' ? member.id.value : null;
      })
      .filter((value) => value !== null);
    this.enums[enumName] = enumValues;
  }
  async parse() {
    const res = await swc.parseFile(this.config.filename, {
      // @todo: Add into config
      syntax: 'typescript',
      target: 'es2020',
    });
    const enums = res.body.filter((node) => node.type === 'TsEnumDeclaration');
    enums.forEach((enumDeclaration) => {
      this.parseEnum(enumDeclaration);
    });
    const typesDeclarations = res.body.filter(
      (node) => node.type === 'TsTypeAliasDeclaration'
    );
    if (!typesDeclarations) {
      throw new Error('No types declarations found');
    }
    typesDeclarations.forEach((typeDeclaration) => {
      this.typeDeclarationToForm(typeDeclaration);
    });
    return this.forms;
  }
  render() {}
};

// ../../packages/plugins/vite-plugin-generate-form-schema.ts
function generateFormSchemaPlugin() {
  return {
    name: 'generate-form-schema-plugin',
    configureServer(server) {
      const fileToWatch = 'path/to/config.json';
      watch(fileToWatch, () => {
        console.log(`${fileToWatch} has changed. Reloading...`);
        server.restart();
      });
    },
    // Hook into the Vite build process
    async buildStart() {
      const currentDir = process.cwd();
      console.log('Generating form schema...', currentDir);
      const tsSchemaPath =
        process.env.TS_SCHEMA_PATH ?? path.resolve(currentDir, 'schema.ts');
      const dynamicForm = new DynamicForm({
        filename: tsSchemaPath,
      });
      const data = await dynamicForm.parse();
      const filePath = path.resolve(
        currentDir,
        'public/generated-form-schema.json'
      );
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Generated JSON file at: ${filePath}`);
    },
  };
}

// vite.config.ts
var vite_config_default = defineConfig({
  plugins: [tsconfigPaths(), react(), generateFormSchemaPlugin()],
});
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAiLi4vLi4vcGFja2FnZXMvcGx1Z2lucy92aXRlLXBsdWdpbi1nZW5lcmF0ZS1mb3JtLXNjaGVtYS50cyIsICIuLi8uLi9wYWNrYWdlcy9jb3JlL2R5bmFtaWMtZm9ybS50cyIsICIuLi8uLi9wYWNrYWdlcy9jb3JlL3V0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL3BhbG9pdC9EZXNrdG9wL2R5bmFtaWMtZm9ybXMtdHMvZXhhbXBsZXMvc2ltcGxlLWZvcm1cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9wYWxvaXQvRGVza3RvcC9keW5hbWljLWZvcm1zLXRzL2V4YW1wbGVzL3NpbXBsZS1mb3JtL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9wYWxvaXQvRGVza3RvcC9keW5hbWljLWZvcm1zLXRzL2V4YW1wbGVzL3NpbXBsZS1mb3JtL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB0c2NvbmZpZ1BhdGhzIGZyb20gJ3ZpdGUtdHNjb25maWctcGF0aHMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUZvcm1TY2hlbWFQbHVnaW4gfSBmcm9tICcuLi8uLi9wYWNrYWdlcy9wbHVnaW5zL3ZpdGUtcGx1Z2luLWdlbmVyYXRlLWZvcm0tc2NoZW1hJztcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFt0c2NvbmZpZ1BhdGhzKCksIHJlYWN0KCksIGdlbmVyYXRlRm9ybVNjaGVtYVBsdWdpbigpXSxcbn0pXG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9wYWxvaXQvRGVza3RvcC9keW5hbWljLWZvcm1zLXRzL3BhY2thZ2VzL3BsdWdpbnNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9wYWxvaXQvRGVza3RvcC9keW5hbWljLWZvcm1zLXRzL3BhY2thZ2VzL3BsdWdpbnMvdml0ZS1wbHVnaW4tZ2VuZXJhdGUtZm9ybS1zY2hlbWEudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3BhbG9pdC9EZXNrdG9wL2R5bmFtaWMtZm9ybXMtdHMvcGFja2FnZXMvcGx1Z2lucy92aXRlLXBsdWdpbi1nZW5lcmF0ZS1mb3JtLXNjaGVtYS50c1wiO2ltcG9ydCB7IHdyaXRlRmlsZVN5bmMsIHdhdGNoIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBWaXRlRGV2U2VydmVyIH0gZnJvbSAndml0ZSc7XG5cbmltcG9ydCB7IER5bmFtaWNGb3JtIH0gZnJvbSAnLi4vY29yZS9keW5hbWljLWZvcm0nO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGb3JtU2NoZW1hUGx1Z2luKCkge1xuICByZXR1cm4ge1xuICAgIG5hbWU6ICdnZW5lcmF0ZS1mb3JtLXNjaGVtYS1wbHVnaW4nLFxuXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcjogVml0ZURldlNlcnZlcikge1xuICAgICAgLy8gV2F0Y2ggdGhlIHNwZWNpZmllZCBmaWxlXG4gICAgICBjb25zdCBmaWxlVG9XYXRjaCA9ICdwYXRoL3RvL2NvbmZpZy5qc29uJztcblxuICAgICAgd2F0Y2goZmlsZVRvV2F0Y2gsICgpID0+IHtcbiAgICAgICAgLy8gVHJpZ2dlciBzZXJ2ZXIgcmVsb2FkIHdoZW4gdGhlIGZpbGUgY2hhbmdlc1xuICAgICAgICBjb25zb2xlLmxvZyhgJHtmaWxlVG9XYXRjaH0gaGFzIGNoYW5nZWQuIFJlbG9hZGluZy4uLmApO1xuICAgICAgICBzZXJ2ZXIucmVzdGFydCgpOyAvLyBWaXRlJ3MgcmVzdGFydCBmdW5jdGlvbiB0byB0cmlnZ2VyIHRoZSBwbHVnaW4gYWdhaW5cbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvLyBIb29rIGludG8gdGhlIFZpdGUgYnVpbGQgcHJvY2Vzc1xuICAgIGFzeW5jIGJ1aWxkU3RhcnQoKSB7XG4gICAgICBjb25zdCBjdXJyZW50RGlyID0gcHJvY2Vzcy5jd2QoKTtcbiAgICAgIGNvbnNvbGUubG9nKCdHZW5lcmF0aW5nIGZvcm0gc2NoZW1hLi4uJywgY3VycmVudERpcik7XG4gICAgICBjb25zdCB0c1NjaGVtYVBhdGggPVxuICAgICAgICBwcm9jZXNzLmVudi5UU19TQ0hFTUFfUEFUSCA/PyBwYXRoLnJlc29sdmUoY3VycmVudERpciwgJ3NjaGVtYS50cycpO1xuXG4gICAgICBjb25zdCBkeW5hbWljRm9ybSA9IG5ldyBEeW5hbWljRm9ybSh7XG4gICAgICAgIGZpbGVuYW1lOiB0c1NjaGVtYVBhdGgsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGR5bmFtaWNGb3JtLnBhcnNlKCk7XG5cbiAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5yZXNvbHZlKFxuICAgICAgICBjdXJyZW50RGlyLFxuICAgICAgICAncHVibGljL2dlbmVyYXRlZC1mb3JtLXNjaGVtYS5qc29uJ1xuICAgICAgKTsgLy8gUGF0aCB0byB0aGUgSlNPTiBmaWxlIGluIHRoZSBwdWJsaWMgZm9sZGVyXG5cbiAgICAgIC8vIFdyaXRlIHRoZSBKU09OIGZpbGUgdG8gdGhlIHNwZWNpZmllZCBwYXRoXG4gICAgICB3cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKSwgJ3V0Zi04Jyk7XG4gICAgICBjb25zb2xlLmxvZyhgR2VuZXJhdGVkIEpTT04gZmlsZSBhdDogJHtmaWxlUGF0aH1gKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvcGFsb2l0L0Rlc2t0b3AvZHluYW1pYy1mb3Jtcy10cy9wYWNrYWdlcy9jb3JlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvcGFsb2l0L0Rlc2t0b3AvZHluYW1pYy1mb3Jtcy10cy9wYWNrYWdlcy9jb3JlL2R5bmFtaWMtZm9ybS50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvcGFsb2l0L0Rlc2t0b3AvZHluYW1pYy1mb3Jtcy10cy9wYWNrYWdlcy9jb3JlL2R5bmFtaWMtZm9ybS50c1wiO2ltcG9ydCAqIGFzIHN3YyBmcm9tICdAc3djL2NvcmUnO1xuXG5pbXBvcnQgeyBGb3JtRGVmaW5pdGlvbiwgRm9ybUZpZWxkLCBGb3JtRmllbGRUeXBlIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBjYXBpdGFsaXplRmlyc3RMZXR0ZXIsIGNvbXBvc2UsIHNpbmd1bGFyaXplIH0gZnJvbSAnLi91dGlscyc7XG5cbnR5cGUgRHluYW1pY0Zvcm1Db25maWcgPSB7XG4gIGZpbGVuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEeW5hbWljRm9ybSB7XG4gIGZvcm1zOiBSZWNvcmQ8c3RyaW5nLCBGb3JtRGVmaW5pdGlvbj4gPSB7fTtcblxuICBlbnVtczogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge307XG5cbiAgY29uZmlnOiBEeW5hbWljRm9ybUNvbmZpZztcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IER5bmFtaWNGb3JtQ29uZmlnID0geyBmaWxlbmFtZTogJy4vc2NoZW1hLnRzJyB9KSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIH1cblxuICBUc0tleXdvcmRUeXBlID0gdGhpcy50c0tleXdvcmRUeXBlVG9Gb3JtLmJpbmQodGhpcyk7XG4gIFRzQXJyYXlUeXBlID0gdGhpcy50c0FycmF5VHlwZVRvRm9ybS5iaW5kKHRoaXMpO1xuICBUc1R5cGVSZWZlcmVuY2UgPSB0aGlzLnRzVHlwZVJlZmVyZW5jZVRvRm9ybS5iaW5kKHRoaXMpO1xuXG4gIHRzS2V5d29yZFR5cGVUb0Zvcm0odHlwZTogc3djLlRzS2V5d29yZFR5cGUpOiBGb3JtRmllbGQge1xuICAgIHJldHVybiB7IHR5cGU6IHR5cGUua2luZCB9O1xuICB9XG5cbiAgdHNBcnJheVR5cGVUb0Zvcm0odHlwZTogc3djLlRzQXJyYXlUeXBlLCBwcm9wZXJ0eU5hbWU6IHN0cmluZyA9ICcnKTogRm9ybUZpZWxkIHtcbiAgICBjb25zdCBlbGVtZW50VHlwZSA9IHR5cGUuZWxlbVR5cGUudHlwZTtcblxuICAgIGxldCBmb3JtVHlwZTogc3RyaW5nIHwgRm9ybUZpZWxkID0gJ3Vua25vd24nO1xuXG4gICAgaWYgKGVsZW1lbnRUeXBlID09PSAnVHNUeXBlUmVmZXJlbmNlJykge1xuICAgICAgZm9ybVR5cGUgPSB0aGlzLnRzVHlwZVJlZmVyZW5jZVRvRm9ybSh0eXBlLmVsZW1UeXBlIGFzIHN3Yy5Uc1R5cGVSZWZlcmVuY2UpLnR5cGU7XG4gICAgfVxuICAgIFxuICAgIGlmIChlbGVtZW50VHlwZSA9PT0gJ1RzS2V5d29yZFR5cGUnKSB7XG4gICAgICBmb3JtVHlwZSA9IGAke3RoaXMudHNLZXl3b3JkVHlwZVRvRm9ybSh0eXBlLmVsZW1UeXBlIGFzIHN3Yy5Uc0tleXdvcmRUeXBlKX1gO1xuICAgIH1cblxuICAgIGlmIChlbGVtZW50VHlwZSA9PT0gJ1RzQXJyYXlUeXBlJykge1xuICAgICAgZm9ybVR5cGUgPSB0aGlzLnRzQXJyYXlUeXBlVG9Gb3JtKHR5cGUuZWxlbVR5cGUgYXMgc3djLlRzQXJyYXlUeXBlKTtcbiAgICB9XG5cbiAgICBpZiAoZWxlbWVudFR5cGUgPT09ICdUc1R5cGVMaXRlcmFsJykge1xuICAgICAgY29uc3Qgbm9ybSA9IGNvbXBvc2UoY2FwaXRhbGl6ZUZpcnN0TGV0dGVyLCBzaW5ndWxhcml6ZSk7XG4gICAgICBjb25zdCBpbmZlcnJlZE5hbWUgPSBub3JtKHByb3BlcnR5TmFtZSkgPz8gYEluZmVycmVkJHtPYmplY3Qua2V5cyh0aGlzLmZvcm1zKS5sZW5ndGh9YDtcbiAgICAgIGNvbnN0IGZvcm0gPSB0aGlzLnRzTGl0ZXJhbFR5cGVUb0Zvcm0odHlwZS5lbGVtVHlwZSBhcyBzd2MuVHNUeXBlTGl0ZXJhbCk7XG5cbiAgICAgIHRoaXMuZm9ybXNbaW5mZXJyZWROYW1lXSA9IGZvcm07XG4gICAgICBcbiAgICAgIGZvcm1UeXBlID0gaW5mZXJyZWROYW1lO1xuICAgIH1cblxuICAgIHJldHVybiB7IHR5cGU6ICdhcnJheScsIHJlZjogZm9ybVR5cGUgfTtcbiAgfVxuXG4gIHRzVHlwZVJlZmVyZW5jZVRvRm9ybSh0eXBlOiBzd2MuVHNUeXBlUmVmZXJlbmNlKTogRm9ybUZpZWxkIHtcbiAgICBpZiAodHlwZS50eXBlTmFtZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6ICd1bmtub3duJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IGlzRW51bSA9IHRoaXMuZW51bXNbdHlwZS50eXBlTmFtZS52YWx1ZV0gIT09IHVuZGVmaW5lZDtcblxuICAgIGlmIChpc0VudW0pIHtcbiAgICAgIHJldHVybiB7IHR5cGU6ICdlbnVtJywgcmVmOiB0eXBlLnR5cGVOYW1lLnZhbHVlIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdHlwZTogJ29iamVjdCcsIHJlZjogdHlwZS50eXBlTmFtZS50eXBlIH07XG4gIH1cblxuICB0c0xpdGVyYWxUeXBlVG9Gb3JtKGxpdGVyYWw6IHN3Yy5Uc1R5cGVMaXRlcmFsKTogRm9ybURlZmluaXRpb24gIHtcbiAgICBjb25zdCByZWNvcmQ6IEZvcm1EZWZpbml0aW9uID0ge307XG4gICAgbGl0ZXJhbC5tZW1iZXJzLmZvckVhY2goKG1lbWJlcikgPT4ge1xuICAgICAgY29uc3Qgc3RydWN0ID0gbWVtYmVyLnR5cGUgPT09ICdUc1Byb3BlcnR5U2lnbmF0dXJlJyA/IG1lbWJlciA6IG51bGw7XG5cbiAgICAgIGNvbnNvbGUubG9nKHN0cnVjdClcblxuICAgICAgaWYgKCFzdHJ1Y3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSBzdHJ1Y3Qua2V5LnR5cGUgPT09ICdJZGVudGlmaWVyJyA/IHN0cnVjdC5rZXkudmFsdWUgOiBudWxsO1xuXG4gICAgICBpZiAoIXByb3BlcnR5TmFtZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghc3RydWN0LnR5cGVBbm5vdGF0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyB0eXBlQW5ub3RhdGlvbiB9ID0gc3RydWN0O1xuXG4gICAgICBpZiAoIXR5cGVBbm5vdGF0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvclxuICAgICAgY29uc3QgZ2V0Rm9ybURlZmluaXRpb24gPSB0aGlzW3R5cGVBbm5vdGF0aW9uLnR5cGVBbm5vdGF0aW9uLnR5cGVdIGFzICh0eXBlOiBzd2MuVHNUeXBlLCBwcm9wZXJ0eU5hbWU/OiBzdHJpbmcpID0+IEZvcm1GaWVsZCA/PyAoKCkgPT4gbnVsbCk7XG5cbiAgICAgIGNvbnN0IHByb3BlcnR5VHlwZSA9IGdldEZvcm1EZWZpbml0aW9uKHR5cGVBbm5vdGF0aW9uLnR5cGVBbm5vdGF0aW9uLCBwcm9wZXJ0eU5hbWUpO1xuXG4gICAgICBpZiAoIXByb3BlcnR5VHlwZSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHJlY29yZFtwcm9wZXJ0eU5hbWVdID0gcHJvcGVydHlUeXBlO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlY29yZDtcbiAgfVxuXG4gIHR5cGVEZWNsYXJhdGlvblRvRm9ybSh0eXBlRGVjbGFyYXRpb246IHN3Yy5Uc1R5cGVBbGlhc0RlY2xhcmF0aW9uKSB7XG4gICAgY29uc3QgZm9ybU5hbWUgPSB0eXBlRGVjbGFyYXRpb24uaWQudHlwZSA9PT0gJ0lkZW50aWZpZXInID8gdHlwZURlY2xhcmF0aW9uLmlkLnZhbHVlIDogbnVsbDtcblxuICAgIGNvbnN0IGlzVHlwZUxpdGVyYWwgPSB0eXBlRGVjbGFyYXRpb24udHlwZUFubm90YXRpb24udHlwZSA9PT0gJ1RzVHlwZUxpdGVyYWwnO1xuXG4gICAgaWYgKCFpc1R5cGVMaXRlcmFsIHx8ICFmb3JtTmFtZSkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIGNvbnN0IGxpdGVyYWwgPSB0eXBlRGVjbGFyYXRpb24udHlwZUFubm90YXRpb24gYXMgc3djLlRzVHlwZUxpdGVyYWw7XG5cbiAgICBjb25zdCBmb3JtID0gdGhpcy50c0xpdGVyYWxUeXBlVG9Gb3JtKGxpdGVyYWwpO1xuXG4gICAgdGhpcy5mb3Jtc1tmb3JtTmFtZV0gPSBmb3JtO1xuICB9XG5cbiAgcGFyc2VFbnVtKGVudW1EZWNsYXJhdGlvbjogc3djLlRzRW51bURlY2xhcmF0aW9uKSB7XG4gICAgY29uc3QgZW51bU5hbWUgPSBlbnVtRGVjbGFyYXRpb24uaWQudHlwZSA9PT0gJ0lkZW50aWZpZXInID8gZW51bURlY2xhcmF0aW9uLmlkLnZhbHVlIDogbnVsbDtcblxuICAgIGlmICghZW51bU5hbWUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlbnVtVmFsdWVzID0gZW51bURlY2xhcmF0aW9uLm1lbWJlcnMubWFwKChtZW1iZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1iZXIuaWQudHlwZSA9PT0gJ0lkZW50aWZpZXInID8gbWVtYmVyLmlkLnZhbHVlIDogbnVsbDtcbiAgICB9KS5maWx0ZXIoKHZhbHVlKSA9PiB2YWx1ZSAhPT0gbnVsbCk7XG5cbiAgICB0aGlzLmVudW1zW2VudW1OYW1lXSA9IGVudW1WYWx1ZXM7XG4gIH1cblxuICBhc3luYyBwYXJzZSgpIHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBzd2MucGFyc2VGaWxlKHRoaXMuY29uZmlnLmZpbGVuYW1lLCB7XG4gICAgICAvLyBAdG9kbzogQWRkIGludG8gY29uZmlnXG4gICAgICBzeW50YXg6ICd0eXBlc2NyaXB0JyxcbiAgICAgIHRhcmdldDogJ2VzMjAyMCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnVtcyA9IHJlcy5ib2R5LmZpbHRlcigobm9kZSkgPT4gbm9kZS50eXBlID09PSAnVHNFbnVtRGVjbGFyYXRpb24nKTtcblxuICAgIGVudW1zLmZvckVhY2goKGVudW1EZWNsYXJhdGlvbikgPT4ge1xuICAgICAgdGhpcy5wYXJzZUVudW0oZW51bURlY2xhcmF0aW9uKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHR5cGVzRGVjbGFyYXRpb25zID0gcmVzLmJvZHkuZmlsdGVyKChub2RlKSA9PiBub2RlLnR5cGUgPT09ICdUc1R5cGVBbGlhc0RlY2xhcmF0aW9uJyk7XG5cbiAgICBpZiAoIXR5cGVzRGVjbGFyYXRpb25zKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHR5cGVzIGRlY2xhcmF0aW9ucyBmb3VuZCcpO1xuICAgIH1cblxuICAgIHR5cGVzRGVjbGFyYXRpb25zLmZvckVhY2goKHR5cGVEZWNsYXJhdGlvbikgPT4ge1xuICAgICAgdGhpcy50eXBlRGVjbGFyYXRpb25Ub0Zvcm0odHlwZURlY2xhcmF0aW9uKTtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmZvcm1zO1xuICB9XG5cbiAgcmVuZGVyKCkge1xuICAgIC8vIFRPRE86IEltcGxlbWVudCByZW5kZXIgbWV0aG9kXG4gIH1cbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL3BhbG9pdC9EZXNrdG9wL2R5bmFtaWMtZm9ybXMtdHMvcGFja2FnZXMvY29yZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3BhbG9pdC9EZXNrdG9wL2R5bmFtaWMtZm9ybXMtdHMvcGFja2FnZXMvY29yZS91dGlscy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvcGFsb2l0L0Rlc2t0b3AvZHluYW1pYy1mb3Jtcy10cy9wYWNrYWdlcy9jb3JlL3V0aWxzLnRzXCI7ZXhwb3J0IGZ1bmN0aW9uIGNhcGl0YWxpemVGaXJzdExldHRlcihzdHJpbmc6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzdHJpbmcuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHJpbmcuc2xpY2UoMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaW5ndWxhcml6ZSh3b3JkOiBzdHJpbmcpIHtcbiAgLy8gSGFuZGxlIGNvbW1vbiBpcnJlZ3VsYXIgcGx1cmFsIGZvcm1zXG4gIGNvbnN0IGlycmVndWxhcnM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG4gICAgJ2NoaWxkcmVuJzogJ2NoaWxkJyxcbiAgICAnbWVuJzogJ21hbicsXG4gICAgJ3dvbWVuJzogJ3dvbWFuJyxcbiAgICAnZmVldCc6ICdmb290JyxcbiAgICAndGVldGgnOiAndG9vdGgnLFxuICAgICdtaWNlJzogJ21vdXNlJyxcbiAgICAnZ2Vlc2UnOiAnZ29vc2UnLFxuICAgICdwZW9wbGUnOiAncGVyc29uJ1xuICB9O1xuXG4gIC8vIENoZWNrIGZvciBpcnJlZ3VsYXIgcGx1cmFscyBmaXJzdFxuICBpZiAoaXJyZWd1bGFyc1t3b3JkLnRvTG93ZXJDYXNlKCldKSB7XG4gICAgcmV0dXJuIGlycmVndWxhcnNbd29yZC50b0xvd2VyQ2FzZSgpXTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBwbHVyYWwgc3VmZml4ZXNcbiAgaWYgKHdvcmQuZW5kc1dpdGgoJ2llcycpKSB7XG4gICAgLy8gZS5nLiwgXCJwYXJ0aWVzXCIgLT4gXCJwYXJ0eVwiXG4gICAgcmV0dXJuIHdvcmQuc2xpY2UoMCwgLTMpICsgJ3knO1xuICB9IGVsc2UgaWYgKHdvcmQuZW5kc1dpdGgoJ3ZlcycpKSB7XG4gICAgLy8gZS5nLiwgXCJ3aXZlc1wiIC0+IFwid2lmZVwiLCBcImxlYXZlc1wiIC0+IFwibGVhZlwiXG4gICAgcmV0dXJuIHdvcmQuc2xpY2UoMCwgLTMpICsgJ2YnO1xuICB9IGVsc2UgaWYgKHdvcmQuZW5kc1dpdGgoJ2VzJykpIHtcbiAgICAvLyBlLmcuLCBcImJveGVzXCIgLT4gXCJib3hcIiwgXCJ3aXNoZXNcIiAtPiBcIndpc2hcIlxuICAgIHJldHVybiB3b3JkLnNsaWNlKDAsIC0yKTtcbiAgfSBlbHNlIGlmICh3b3JkLmVuZHNXaXRoKCdzJykgJiYgd29yZC5sZW5ndGggPiAxICYmICF3b3JkLmVuZHNXaXRoKCdzcycpKSB7XG4gICAgLy8gZS5nLiwgXCJjYXJzXCIgLT4gXCJjYXJcIiAoYnV0IG5vdCBcImdsYXNzXCIpXG4gICAgcmV0dXJuIHdvcmQuc2xpY2UoMCwgLTEpO1xuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSB3b3JkIHVuY2hhbmdlZCBpZiBubyBzaW5ndWxhcml6YXRpb24gcnVsZSBpcyBtYXRjaGVkXG4gIHJldHVybiB3b3JkO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2UgPFQ+KC4uLmZuczogRnVuY3Rpb25bXSk6IEZ1bmN0aW9uIHtcbiAgcmV0dXJuIGZucy5yZWR1Y2UoKGYsIGcpID0+ICguLi5hcmdzOiBUW10pID0+IGYoZyguLi5hcmdzKSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFtVyxTQUFTLG9CQUFvQjtBQUNoWSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxtQkFBbUI7OztBQ0Z1VyxTQUFTLGVBQWUsYUFBYTtBQUN0YSxPQUFPLFVBQVU7OztBQ0QrVCxZQUFZLFNBQVM7OztBQ0E1QixTQUFTLHNCQUFzQixRQUF3QjtBQUM5WCxTQUFPLE9BQU8sT0FBTyxDQUFDLEVBQUUsWUFB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
