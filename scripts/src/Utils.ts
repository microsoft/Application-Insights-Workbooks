const fs = require('fs');
const path = require('path');
const { exit } = require('process');

const Encoding = 'utf8';

// Flag to turn on or off console logs
const LogInfo = false;

export function logMessage(message: string) {
    if (LogInfo) {
      console.log("INFO: ", message);
    }
  }
  
export function logError(message: string, shouldExit=false) {
    console.error("ERROR: ", message);
    if (shouldExit) {
        process.exit(1);
    }
}

export function getDirectories(srcpath: string) : string[] {
    return fs.statSync(srcpath).isDirectory() ? fs.readdirSync(srcpath)
      .map(file => path.join(srcpath, file))
      .filter(path => fs.statSync(path).isDirectory()) : [];
  }
  
export function flatten(lists: string[][]) : string[] {
    return lists.reduce((a, b) => a.concat(b), []);
}
  
export function getDirectoriesRecursive(srcpath: string): string[] {
    return [srcpath, ...flatten(getDirectories(srcpath).map(getDirectoriesRecursive))];
}

/** Enure given path is valid */
export function testPath(path) : boolean {
    logMessage("Processing template path: " + path);
    if (fs.existsSync(path)) {
      return true;
    } else {
      logError("Template path does not exist: " + path);
      return false;
    }
  }

  export function readTemplateFile(file) : object {
    try {
        const data = fs.readFileSync(file, Encoding);
        return JSON.parse(data);
    } catch (err) {
        logError("Cannot open file: " + file + " Error: " + err, true);
    }
}

export function forEachKey(x: any, func: (key, value) => void, sort?: (a: { [key: string]:any }, b:{ [key: string]:any }) => number ) {
    if (sort) {
        let asArray = Object.keys(x).map(y => { return { key: y, value: x[y] }; }).sort(sort).forEach(pair => func(pair.key, pair.value));
    } else {
        Object.keys(x).forEach( key => func(key, x[key]));
    }
}

/** replace tab, newlines, etc with single spaces */
export function flattenString(s: string) : String {
    return s ? s.replace( /\s+/ig, " ") : "";
}


export function isEmpty(v: any) {
    return v === undefined || v === null || Array.isArray(v) && v.length === 0 || v === "";
}

export function notNullOrUndefined<T>(v: T) : boolean {
    return v !== undefined && v !== null;
}

export function isNullOrWhitespace(v: any) : boolean {
    return isEmpty(v) || typeof(v) === "string" && v.trim().length === 0;
}
