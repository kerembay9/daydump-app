#!/usr/bin/env python3
"""DayDump e2e: parallel Android emulators + Maestro flows + screenshot diffs. See README.md.

  ./e2e.py setup                 photo set + AVD + 'seeded' snapshot (once, ~5 min)
  ./e2e.py build [--debug]       e2e (release-like) or debug APK
  ./e2e.py run -n 4 [--headed] [--debug] [--update] [flow ...]
Only ever talks to emulators it started (adb -s emulator-NNNN); a USB phone is never touched.
"""
import argparse, io, json, os, shutil, socket, subprocess as sp, sys, time, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent
CACHE, OUT, BASE = HERE / '.cache', HERE / 'out', HERE / 'baselines'
SDK = Path(os.environ.get('ANDROID_HOME', Path.home() / 'Android/Sdk'))
ADB, EMU = str(SDK / 'platform-tools/adb'), str(SDK / 'emulator/emulator')
AVDMANAGER = str(SDK / 'cmdline-tools/latest/bin/avdmanager')
MAESTRO = shutil.which('maestro') or str(Path.home() / '.maestro/bin/maestro')
ENV = {**os.environ, 'ANDROID_HOME': str(SDK), 'JAVA_HOME': os.environ.get('JAVA_HOME', '/usr/lib/jvm/java-17-openjdk-amd64')}
AVD, IMAGE, SNAP, PKG = 'daydump-e2e', 'system-images;android-35;google_apis;x86_64', 'seeded', 'com.daydump.app'
APK = {'e2e': APP / 'android/app/build/outputs/apk/e2e/app-e2e.apk',
       'debug': APP / 'android/app/build/outputs/apk/debug/app-debug.apk'}
N_PHOTOS, PER_DAY = 100, 10
PLACES = [(41.0082, 28.9784), (48.8566, 2.3522), (38.7223, -9.1393), (40.4168, -3.7038), None]  # Istanbul, Paris, Lisbon, Madrid, no GPS
# Screenshot diff: ignore status bar + gesture bar, count pixels whose channel diff > TOL, fail above MAX_FRAC.
CROP_TOP, CROP_BOTTOM, TOL, MAX_FRAC = 120, 80, 40, 0.004


def run(cmd, **kw):
    return sp.run([str(c) for c in cmd], env=ENV, check=kw.pop('check', True), text=True, **kw)


def adb(serial, *args, **kw):
    return run([ADB, '-s', serial, *args], capture_output=True, **kw).stdout.strip()


# ---------- photo set ----------
def photo_set():
    """100 deterministic Lorem Picsum photos, 10 per 'day' across June 2025, EXIF date + GPS per day."""
    from PIL import Image
    from PIL.TiffImagePlugin import IFDRational
    d = CACHE / 'photos'
    d.mkdir(parents=True, exist_ok=True)
    ids_file = CACHE / 'picsum_ids.json'
    if not ids_file.exists():
        lst = json.load(urllib.request.urlopen(f'https://picsum.photos/v2/list?page=1&limit={N_PHOTOS}', timeout=30))
        ids_file.write_text(json.dumps([p['id'] for p in lst]))
    ids = json.loads(ids_file.read_text())

    def dms(x):
        m, s = divmod(abs(x) * 3600, 60)
        dg, m = divmod(m, 60)
        return (IFDRational(int(dg), 1), IFDRational(int(m), 1), IFDRational(round(s * 100), 100))

    def one(i):
        f = d / f'dd_{i:03d}.jpg'
        if f.exists():
            return
        day, slot = divmod(i, PER_DAY)
        w, h = (1080, 1350) if i % 3 else (1350, 1080)
        raw = urllib.request.urlopen(f'https://picsum.photos/id/{ids[i]}/{w}/{h}', timeout=60).read()
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        when = datetime(2025, 6, 1, 10) + timedelta(days=day * 3, minutes=slot * 47)
        ts = when.strftime('%Y:%m:%d %H:%M:%S')
        ex = Image.Exif()
        ex[0x0132] = ts
        sub = ex.get_ifd(0x8769)
        sub[0x9003] = sub[0x9004] = ts
        sub[0x9010] = sub[0x9011] = '+00:00'  # MediaStore leaves datetaken NULL without an offset
        place = PLACES[day % len(PLACES)]
        if place:
            gps = ex.get_ifd(0x8825)
            gps[1], gps[2] = ('N' if place[0] >= 0 else 'S'), dms(place[0])
            gps[3], gps[4] = ('E' if place[1] >= 0 else 'W'), dms(place[1])
        im.save(f.with_suffix('.tmp'), 'JPEG', quality=88, exif=ex)
        f.with_suffix('.tmp').rename(f)
        os.utime(f, (when.timestamp(),) * 2)  # adb push keeps mtime -> date_modified fallback

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, range(N_PHOTOS)))
    print(f'photos: {len(list(d.glob("*.jpg")))} in {d}')
    return d


# ---------- emulators ----------
def free_ports(n):
    used = set(run([ADB, 'devices'], capture_output=True).stdout.split())
    ports, p = [], 5560  # 5554-5558 left for anything you start by hand
    while len(ports) < n:
        with socket.socket() as s:
            busy = s.connect_ex(('127.0.0.1', p)) == 0
        if not busy and f'emulator-{p}' not in used:
            ports.append(p)
        p += 2
    return ports


def boot(port, headed=False, gpu='swiftshader_indirect', seeded=True, delay=0):
    """Start an emulator and wait for it; retries once if qemu dies (parallel snapshot loads can race)."""
    time.sleep(delay)
    serial = f'emulator-{port}'
    args = [EMU, '-avd', AVD, '-port', port, '-no-audio', '-no-boot-anim', '-gpu', gpu]
    args += ['-read-only', '-snapshot', SNAP, '-no-snapshot-save'] if seeded else ['-no-snapshot-load', '-no-snapshot-save']
    if not headed:
        args.append('-no-window')
    OUT.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        proc = sp.Popen([str(x) for x in args], env=ENV, stdout=open(OUT / f'{serial}.emulator.log', 'a'), stderr=sp.STDOUT, start_new_session=True)
        t0 = time.time()
        while time.time() - t0 < 240 and proc.poll() is None:
            # boot_completed fires before shared storage is mounted
            if adb(serial, 'shell', '[ "$(getprop sys.boot_completed)" = 1 ] && ls -d /sdcard/Pictures', check=False).endswith('/sdcard/Pictures'):
                return serial
            time.sleep(1)
        proc.kill()
        print(f'{serial}: boot attempt {attempt + 1} failed (exit {proc.poll()})')
        time.sleep(3)
    raise SystemExit(f'{serial} did not boot; see {OUT / (serial + ".emulator.log")}')


def kill(serial):
    adb(serial, 'emu', 'kill', check=False)


def setup(a):
    photos = photo_set()
    if not (Path.home() / f'.android/avd/{AVD}.avd').exists():
        run([AVDMANAGER, 'create', 'avd', '-n', AVD, '-k', IMAGE, '-d', 'pixel_6'], input='no\n')
    cfg = Path.home() / f'.android/avd/{AVD}.avd/config.ini'
    kv = dict(l.split('=', 1) for l in cfg.read_text().splitlines() if '=' in l)
    kv.update({'hw.ramSize': '3072', 'hw.cpu.ncore': '2', 'disk.dataPartition.size': '4G', 'hw.keyboard': 'yes',
               'fastboot.forceColdBoot': 'no'})
    cfg.write_text(''.join(f'{k}={v}\n' for k, v in kv.items()))
    serial = boot(free_ports(1)[0], headed=a.headed, seeded=False)
    try:
        for k in ('window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'):
            adb(serial, 'shell', 'settings', 'put', 'global', k, '0')
        adb(serial, 'shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '0')
        adb(serial, 'shell', 'mkdir', '-p', '/sdcard/Pictures/DayDumpE2E')
        adb(serial, 'push', *sorted(map(str, photos.glob('*.jpg'))), '/sdcard/Pictures/DayDumpE2E/')
        adb(serial, 'shell', 'content', 'call', '--uri', 'content://media', '--method', 'scan_volume', '--arg', 'external_primary', check=False)
        for _ in range(60):
            n = adb(serial, 'shell', 'content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_id', check=False).count('Row:')
            if n >= N_PHOTOS:
                break
            time.sleep(2)
        print(f'{serial}: {n} photos in MediaStore')
        adb(serial, 'emu', 'avd', 'snapshot', 'save', SNAP)
        print(f'snapshot "{SNAP}" saved')
    finally:
        kill(serial)


# ---------- build ----------
def build(a):
    if a.debug:  # both ABIs so the same debug APK still runs on a phone
        cmd = ['./gradlew', '-q', 'assembleDebug', '-PreactNativeArchitectures=arm64-v8a,x86_64']
    else:
        cmd = ['./gradlew', '-q', '--init-script', HERE / 'e2e.gradle', 'assembleE2e', '-PreactNativeArchitectures=x86_64']
    run(cmd, cwd=APP / 'android')
    print(APK['debug' if a.debug else 'e2e'])


# ---------- run ----------
def junit(path):
    if not path.exists():
        return {}
    return {tc.get('name'): ('fail' if tc.find('failure') is not None or tc.find('error') is not None else 'pass', float(tc.get('time') or 0))
            for tc in ET.parse(path).iter('testcase')}


def diff(shot, update):
    from PIL import Image, ImageChops
    base = BASE / shot.name
    if update or not base.exists():
        BASE.mkdir(exist_ok=True)
        shutil.copy(shot, base)
        return 'new' if not update else 'updated'
    a, b = Image.open(shot).convert('RGB'), Image.open(base).convert('RGB')
    if a.size != b.size:
        return f'FAIL size {a.size} vs {b.size}'
    box = (0, CROP_TOP, a.width, a.height - CROP_BOTTOM)
    d = ImageChops.difference(a.crop(box), b.crop(box)).convert('L').point(lambda v: 255 if v > TOL else 0)
    frac = d.histogram()[255] / (d.width * d.height)
    if frac <= MAX_FRAC:
        return f'ok {frac:.2%}'
    red = Image.new('RGB', d.size, (255, 0, 0))
    out = a.crop(box)
    out.paste(red, mask=d)
    out.save(shot.with_name(shot.stem + '.diff.png'))
    return f'FAIL {frac:.2%} (see {shot.stem}.diff.png)'


def run_flows(a):
    mode = 'debug' if a.debug else 'e2e'
    apk = Path(a.apk) if a.apk else APK[mode]
    if not apk.exists():
        raise SystemExit(f'no APK at {apk}; run ./e2e.py build{" --debug" if a.debug else ""}')
    flows = [HERE / f for f in a.flows] if a.flows else sorted(HERE.glob('[0-9]*.yaml'))
    n = min(a.n, len(flows))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    t0 = time.time()
    with ThreadPoolExecutor(n) as ex:  # staggered 4 s apart: simultaneous snapshot loads can kill qemu
        futs = [ex.submit(boot, p, a.headed, a.gpu, True, i * 4) for i, p in enumerate(free_ports(n))]
    serials = [f.result() for f in futs if not f.exception()]
    if len(serials) < n:
        for s in serials:
            kill(s)
        raise SystemExit(f'only {len(serials)}/{n} emulators booted; see {OUT}/*.emulator.log')
    print(f'{n} emulators up in {time.time() - t0:.0f} s: {" ".join(serials)}')

    # longest flows first, round-robin, so shards finish together
    order = sorted(flows, key=lambda f: -f.stat().st_size)
    # flows that export to the photo album run last: the new photos would change counts and screens after them
    album = lambda f: 'writes-album' in f.read_text()
    shards = {s: [[f for f in order[i::n] if not album(f)], [f for f in order[i::n] if album(f)]] for i, s in enumerate(serials)}

    def shard(serial):
        d = OUT / serial
        d.mkdir()
        adb(serial, 'install', '-r', apk)
        if a.debug:
            adb(serial, 'reverse', 'tcp:8081', 'tcp:8081')
        adb(serial, 'logcat', '-c', check=False)
        log = sp.Popen([ADB, '-s', serial, 'logcat', '-v', 'time'], stdout=open(d / 'logcat.txt', 'w'), stderr=sp.DEVNULL)
        try:
            for k, g in enumerate(shards[serial]):
                if not g:
                    continue
                run([MAESTRO, '--device', serial, 'test', '--format', 'junit', '--output', d / f'junit{k}.xml',
                     '--test-output-dir', d, *g], cwd=d, check=False,
                    stdout=open(d / f'maestro{k}.log', 'w'), stderr=sp.STDOUT)
        finally:
            log.terminate()
        return serial

    try:
        with ThreadPoolExecutor(n) as ex:
            list(ex.map(shard, serials))
    finally:
        if not a.keep:
            for s in serials:
                kill(s)

    failed = False
    print(f'\n{"flow":<34}{"device":<16}{"result":<8}time')
    for s in serials:
        for k, g in enumerate(shards[s]):
            if not g:
                continue
            if not (OUT / s / f'junit{k}.xml').exists():
                failed = True
                print(f'{"(no report)":<34}{s:<16}fail    see {OUT / s / f"maestro{k}.log"}')
                continue
            for name, (res, secs) in junit(OUT / s / f'junit{k}.xml').items():
                failed |= res != 'pass'
                print(f'{name:<34}{s:<16}{res:<8}{secs:.0f} s')
        crashes = [l for l in open(OUT / s / 'logcat.txt', errors='replace') if 'FATAL EXCEPTION' in l or (PKG in l and 'ANR in' in l)]
        if crashes:
            failed = True
            print(f'  {s}: {len(crashes)} crash/ANR line(s) in {OUT / s / "logcat.txt"}')
    shots = sorted(p for p in OUT.glob('*/**/vr_*.png') if not p.stem.endswith('.diff'))
    if shots:
        print('\nscreens')
        for p in shots:
            r = diff(p, a.update)
            failed |= r.startswith('FAIL')
            print(f'  {p.stem:<30}{r}')
    print(f'\n{"FAILED" if failed else "PASSED"} in {time.time() - t0:.0f} s; artifacts in {OUT}')
    sys.exit(1 if failed else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('setup')
    s.add_argument('--headed', action='store_true')
    s.set_defaults(fn=setup)
    b = sub.add_parser('build')
    b.add_argument('--debug', action='store_true')
    b.set_defaults(fn=build)
    r = sub.add_parser('run')
    r.add_argument('flows', nargs='*', help='flow files in .maestro/ (default: all NN_*.yaml)')
    r.add_argument('-n', type=int, default=4, help='parallel emulators (default 4; ~3 GB RAM + 2 cores each)')
    r.add_argument('--headed', action='store_true', help='show emulator windows')
    r.add_argument('--debug', action='store_true', help='debug APK + Metro on :8081 (JS logs, slower)')
    r.add_argument('--apk', help='install this APK instead')
    r.add_argument('--gpu', default='swiftshader_indirect', help='emulator -gpu (host is faster; baselines assume swiftshader)')
    r.add_argument('--update', action='store_true', help='accept current screenshots as baselines')
    r.add_argument('--keep', action='store_true', help='leave emulators running')
    r.set_defaults(fn=run_flows)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
