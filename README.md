# Obsidian GBA Player

Obsidian 오른쪽 사이드바에서 직접 보유한 Game Boy / Game Boy Color / Game Boy Advance ROM을 실행하는 데스크톱 전용 플러그인입니다.

게임 실행은 새로 만든 에뮬레이터가 아니라, 포함된 **EmulatorJS 4.2.3 + mGBA 코어**를 사용합니다. ROM과 BIOS는 포함하지 않습니다.

## 현재 동작

1. Obsidian 왼쪽 리본의 게임패드 버튼 또는 명령 팔레트에서 **GBA 플레이어 열기**를 누릅니다.
2. 오른쪽 사이드바의 **게임 불러오기**를 누릅니다.
3. Vault 또는 PC의 다른 폴더에서 `.gb`, `.gbc`, `.gba` 파일을 선택합니다.
4. 선택한 게임이 동일한 사이드바 안에서 실행됩니다.

포켓몬처럼 게임 안에서 사용하는 일반 저장 기능도 이어집니다. 플러그인은 게임 실행 중 15초마다, 게임을 변경할 때, 그리고 플레이어를 닫을 때 저장 데이터를 Vault의 `GBA Saves/` 폴더에 자동 반영합니다. 다음에 같은 ROM을 열면 해당 저장 데이터를 자동으로 불러옵니다.

저장 파일은 ROM 내용으로 구분하므로, 게임 파일을 PC의 다른 폴더로 옮겨도 이어집니다. 같은 이름의 서로 다른 ROM은 저장 데이터를 공유하지 않습니다. `GBA Saves/` 폴더를 일반 Vault 파일처럼 동기화하거나 백업하면 저장 데이터도 함께 보관됩니다.

게임 화면 위로 마우스를 움직여도 EmulatorJS 메뉴가 뜨지 않습니다. 사이드바 상단의 **설정 열기** 버튼을 눌렀을 때만 게임 설정 메뉴를 열 수 있습니다.

처음 음량은 30%로 시작합니다. 게임은 먼저 무음으로 준비한 뒤, 에뮬레이터가 완전히 시작되면 설정 메뉴에 저장한 음량을 적용합니다. 따라서 부팅음이 큰 기본 음량으로 먼저 재생되지 않습니다. 이후 설정 메뉴에서 바꾼 음량과 게임 옵션은 플러그인이 기억하므로, 다음 게임 실행이나 Obsidian 재시작 뒤에도 그대로 적용됩니다.

BRAT 설치에서는 `main.js`, `manifest.json`, `styles.css`만 내려받습니다. 이 플러그인은 `main.js`에 포함한 mGBA 실행 파일을 `127.0.0.1`의 임시 로컬 주소로만 제공해 사이드바에서 실행합니다. 따라서 플러그인 파일 경로나 Vault 위치에 따라 실행 파일을 찾지 못하는 문제가 없습니다. 인터넷 연결이나 별도 파일 복사는 필요하지 않습니다.

## 설치 전 빌드

이 폴더에서 Node.js 20 이상이 설치된 환경으로 다음을 실행합니다.

```powershell
pnpm install
pnpm run build
```

빌드 후 이 폴더 전체를 Vault의 `.obsidian/plugins/gba-player/`에 두고, Obsidian의 커뮤니티 플러그인 설정에서 **GBA Player**를 활성화합니다.

## BRAT으로 설치

1. Obsidian의 커뮤니티 플러그인에서 **BRAT**을 설치합니다.
2. 명령 팔레트에서 `BRAT: Add a beta plugin for testing`을 실행합니다.
3. `tlatndms2-droid/obsidian-gba-player`를 입력합니다.
4. 설치가 끝나면 커뮤니티 플러그인 목록에서 **GBA Player**를 켭니다.

## 포함된 EmulatorJS 파일

전체 EmulatorJS 배포본이 아닌 GBA 실행에 필요한 공용 실행 파일과 mGBA 코어만 포함했습니다. `vendor/emulator/data/version.json`은 4.2.3을 가리키며, 코어·실행 파일의 SHA-256 기록은 [VENDOR_SOURCES.md](VENDOR_SOURCES.md)에 있습니다.

## 권리와 라이선스

- 본 플러그인에는 게임 ROM, BIOS, 게임 이미지가 들어 있지 않습니다.
- 사용자는 자신이 사용할 권리가 있는 파일만 불러와야 합니다.
- 포함 구성요소의 라이선스와 출처는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.
