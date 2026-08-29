# Obsidian GBA Player

Obsidian 오른쪽 사이드바에서 직접 보유한 Game Boy / Game Boy Color / Game Boy Advance ROM을 실행하는 데스크톱 전용 플러그인입니다.

게임 실행은 새로 만든 에뮬레이터가 아니라, 포함된 **EmulatorJS 4.2.3 + mGBA 코어**를 사용합니다. ROM과 BIOS는 포함하지 않습니다.

## 현재 동작

1. Obsidian 왼쪽 리본의 게임패드 버튼 또는 명령 팔레트에서 **GBA 플레이어 열기**를 누릅니다.
2. 오른쪽 사이드바의 **게임 불러오기**를 누릅니다.
3. Vault 또는 PC의 다른 폴더에서 `.gb`, `.gbc`, `.gba` 파일을 선택합니다.
4. 선택한 게임이 동일한 사이드바 안에서 실행됩니다.

EmulatorJS가 제공하는 게임 메뉴에서 키, 화면 크기, 저장 상태 등의 에뮬레이터 기능을 사용합니다. 에뮬레이터 저장 데이터는 현재 Obsidian Vault 파일이 아니라 EmulatorJS의 로컬 저장소에 보관됩니다.

저장 데이터는 선택한 게임 파일명을 기준으로 이어집니다. 서로 다른 게임 파일이라도 이름이 같으면 같은 저장 데이터를 쓸 수 있으니, 파일명은 겹치지 않게 두는 편이 좋습니다.

BRAT 설치에서는 `main.js`, `manifest.json`, `styles.css`만 내려받습니다. 이 플러그인은 처음 켜질 때 `main.js`에 포함한 mGBA 실행 파일을 플러그인 폴더에 자동으로 복원하므로, BRAT 설치 후에도 별도 파일 복사가 필요 없습니다.

Obsidian의 플러그인 파일 경로가 바뀌어도 실행 엔진을 정확히 찾도록, 게임 화면에는 EmulatorJS 실행 파일의 전체 경로를 직접 전달합니다.

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
