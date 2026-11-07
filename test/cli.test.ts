import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {defaultConfig,writeConfig} from '../src/config.js';

function command(args:string[],root:string){
  return spawnSync(process.execPath,[path.resolve('dist/cli.js'),...args],{env:{...process.env,BILI_AGENT_DATA_DIR:root},encoding:'utf8',timeout:10000,maxBuffer:100000});
}

test('help variants exit successfully without reading account config or starting a runtime',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-help-'));
  try{
    fs.writeFileSync(path.join(root,'config.json'),'deliberately invalid synthetic config');
    for(const args of [['help'],['--help'],['-h'],['inspect','--help'],['setup','-h']]){
      const result=command(args,root);
      assert.equal(result.error,undefined,args.join(' '));
      assert.equal(result.status,0,`${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stdout,/bili-agent/);
      assert.match(result.stdout,/dashboard/);
      assert.equal(result.stderr,'','help must not initialize SQLite or emit diagnostic warnings');
      assert.deepEqual(fs.readdirSync(root),['config.json'],'help must not create database/browser state');
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('offline doctor distinguishes local binding from online verification and omits account identity',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-doctor-'));
  try{
    writeConfig({...defaultConfig(),expected_uid:'123456789'},root);
    const human=command(['doctor'],root);
    assert.equal(human.status,0,human.stderr);
    assert.match(human.stdout,/仅检查本地.*尚未确认登录/);
    assert.match(human.stdout,/本地已绑定.*尚未在线核验/);
    assert.ok(!human.stdout.includes('123456789'));assert.equal(human.stderr,'');
    const result=command(['doctor','--json'],root);
    assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
    const data=JSON.parse(result.stdout);
    assert.equal(data.config_exists,true);
    assert.equal(data.account_bound,true);
    assert.equal(data.online_checked,false);
    assert.equal(data.expected_uid,undefined);
    assert.equal(data.account,undefined);
    assert.equal(data.account_matches,undefined);
    assert.ok(!result.stdout.includes('123456789'));
    assert.equal(result.stderr,'','offline diagnostics must not initialize SQLite');
    assert.deepEqual(fs.readdirSync(root),['config.json']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('missing CLI arguments fail before opening browser or database state',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-arguments-'));
  try{
    for(const [args,code] of [[['inspect'],'VIDEO_REQUIRED'],[['search'],'KEYWORD_REQUIRED']] as const){
      const result=command([...args],root);
      assert.equal(result.status,1);
      const error=JSON.parse(result.stderr);
      assert.equal(error.error.code,code);
      assert.deepEqual(fs.readdirSync(root),[]);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
