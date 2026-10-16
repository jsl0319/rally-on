# Rally On 설치형 앱 시제품

기존 웹 화면과 카카오 **웹 로그인**을 iOS/Android WebView에서 직접 검증하는 개발 전용 프로젝트다. `server.url`을 사용하는 이 패키지는 스토어 제출용이 아니다. 외부 브라우저 쿠키 전달·네이티브 카카오 SDK·푸시는 아직 구현하지 않았다.

## 준비

- Node 22 이상
- iOS: Xcode 26 이상과 iOS SDK. Xcode를 최초 실행하고 추가 구성요소 설치를 완료한다. Settings → Locations에서 Command Line Tools를 선택한다.
- Android: Android Studio 2025.2.1 이상, SDK/API 36 및 platform-tools, JDK 21. 최신 Studio에 포함된 JDK 25는 이 시제품의 Gradle 8.14.3과 호환되지 않으므로 Gradle JDK를 21로 지정한다.
- 이 폴더에서 `npm ci`, `npm run doctor`, `npm test`.

## 대상 설정

```sh
cd mobile/prototype
npm run configure -- --url https://tennis-mate-ochre.vercel.app/login
```

위 주소는 **실제 운영 서버**다. 로그인은 사용자가 직접 하고 목록/상세 조회만 검증한다. 실제 신청·취소·입금 기록 버튼을 시험 삼아 누르지 않는다. 비공개 테스트 서버가 있으면 그 HTTPS 주소를 사용하고 해당 서버의 카카오 callback 등록도 확인한다. 설정 파일에는 인증 키·쿠키·토큰을 넣지 않는다.

로컬 화면만 확인할 때는 같은 Wi-Fi의 Mac LAN 주소를 사용한다. 실제 휴대전화의 `localhost`는 Mac이 아니다. 명시적 `--allow-local-http` 옵션은 사설 IP/루프백에만 허용하며 HTTPS 인증 검증을 대신하지 않는다. `AUTH_URL`이나 운영 OAuth redirect를 임의 변경하지 않는다.

```sh
npm run configure -- --url http://192.168.0.10:3000 --allow-local-http
```

설정과 생성된 플랫폼 파일은 로컬 전용으로 git에서 제외했다. 호스트·시작 주소 변경 뒤에는 `prepare`를 다시 실행한다.

`server.url`에는 origin과 마지막 `/`만 넣고, `/login`은 `server.appStartPath`로 분리한다. Capacitor iOS는 앱 기준 URL 접두어로 내부 이동을 판정하므로 `server.url`에 `/login`까지 넣으면 `/api/auth/callback/kakao`가 외부 브라우저로 열려 PKCE 쿠키 검증에 실패한다. `configure`가 이 구성을 생성한다. 인증 검사를 끄거나 브라우저로 쿠키를 복사해서 우회하지 않는다.

Capacitor iOS는 원격 서버를 사용해도 `appStartPath`에 대응하는 로컬 파일의 존재를 검사하고, 없으면 `exit(1)`로 종료한다. `configure`는 `/login` 시작 시 `www/login`에도 로컬 복구 안내 HTML을 생성한다. `prepare`는 파일 누락을 먼저 검사하며, 빌드 성공만으로 실행 성공을 판단하지 않는다.

iOS 초기 창/로딩 안내의 원본은 `native/ios/SceneDelegate.swift`다. `prepare:ios`가 생성 프로젝트에 반영하며, 생성된 파일을 직접 수정한 흔적이 있으면 덮어쓰지 않고 중단한다. UIKit의 storyboard 창을 재사용하고 최초 로딩이 20초를 넘으면 수동 재연결을 제공한다. 첫 화면 표시 후에는 관찰을 해제하므로 인증 callback이나 거래 요청을 자동 재시도하지 않는다.

iOS 지도 연결은 앱 화면에서 시작된 카카오맵 `/link/to/` 링크에 한해 목적지 좌표와 이름을 네이티브 `kakaomap://route`로 전달한다. 지도 앱 실행 실패 시 HTTPS 링크를 Safari 뷰로 보여 준다. `native/ios/KakaoMapLinks.swift`를 SceneDelegate와 함께 생성 소스에 합치므로 Xcode 프로젝트 파일을 수동 수정하지 않는다. Swift URL 변환 검사는 macOS에서 실행하며 다른 OS에서는 해당 검사만 건너뛴다.

## iPhone

앱 표시 이름은 **랠리온 검증**이며, 앱 식별자 `dev.rallyon.prototype`은 유지한다. 홈 화면 아이콘은 사용자가 확정한 B 원안(R 바깥 오른쪽 위에 테니스공)이다. 원본은 저장소 루트의 `public/images/brand/app-icon.svg`, iOS 원본은 `native/ios/AppIcon.appiconset`에 보관한다. `prepare:ios`는 기존 프로젝트에도 아이콘과 이름을 반영하며 별도 로컬 수정을 발견하면 중단한다. 이름·아이콘 변경은 웹 배포만으로 적용되지 않아 기기 앱 빌드·재설치가 필요하다.

아이콘 원본을 바꾸면 저장소 루트에서 `node ops/brand/generate-icons.mjs`로 웹/iOS/Android 이미지를 함께 갱신한다. 추가 패키지 설치 없이 기존 Next.js 의존성의 sharp를 사용한다. 이전 시안은 `docs/design/app-icon-20261014/`에 유지한다.

```sh
npm run prepare:ios
npm run open:ios
```

Xcode에서 App 타깃의 Signing & Capabilities → 본인 Team을 선택하고 케이블로 연결한 iPhone을 실행 대상으로 고른다. 기기 신뢰·개발자 모드를 직접 승인한 뒤 Debug Run 한다. 개인 무료 서명으로 가능한 범위의 기기 검증을 먼저 하고, 유료 가입이나 TestFlight 배포는 후속으로 진행한다. SPM 의존성 내려받기에는 네트워크가 필요하다.

## Android

Android 휴대전화와 태블릿 모두 같은 검증 앱을 설치한다. 현재 최소 지원은 API 24다. 2026-10-16 갤럭시 탭 S7 FE(Android 14)에서 실기기 검증을 재개했다. 설치 성공과 로그인·화면 검증 결과는 별도로 기록한다.

`prepare:android`는 `native/android`의 이름·B 원안 아이콘·시작 화면 색·기기 뒤로가기 처리를 생성 프로젝트에 반영한다. 기존 별도 수정은 덮어쓰지 않는다. 시스템 뒤로가기는 같은 서비스의 이전 화면으로 돌아가며, 로그인·외부 인증·로그아웃 전 화면으로 넘어갈 때는 앱을 백그라운드로 보낸다. 인증 중에는 카카오 인증 취소 경로만 유지한다. iOS 전용 지도 연결이나 시작 애니메이션까지 Android에 적용된 것으로 간주하지 않는다.

태블릿에서는 세로·가로 화면, 키보드와 하단 메뉴, 시스템 뒤로가기 버튼/제스처를 추가 확인한다. APK 검증 설치에는 스토어 등록이 필요하지 않다. Android 휴대전화의 작은 화면 확인은 별도 후속 검증이다.

```sh
npm run prepare:android
npm run open:android
```

Android Studio에서 Gradle/SDK 동기화를 마친 뒤 USB 디버깅을 켠 휴대전화를 연결하고 기기에서 컴퓨터를 승인한다. Debug Run 한다. 개발 도구가 준비되기 전 APK 빌드 완료라고 표시하지 않는다.

최초 설치 마법사가 SDK 37만 설치했다면 SDK Manager → SDK Platforms에서 Android 16.0 / API 36.0을 추가한다. 이 Mac의 JDK 21은 Homebrew로 설치했으며 경로는 `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`이다. Android Studio Settings → Build, Execution, Deployment → Build Tools → Gradle의 Gradle JDK에도 이 경로를 지정한다. 전역 Java 기본값을 바꿀 필요는 없다.

이 Mac의 Android Studio에서는 호환성 안내의 `Use JVM 21`을 선택했고, IDE가 별도로 받은 JBR 21.0.11을 `GRADLE_LOCAL_JAVA_HOME`으로 지정했다. 이 설정 역시 호환된다. 명령줄 빌드는 아래 Homebrew JDK 21 경로로 검증했다.

```sh
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew assembleDebug --console=plain
```

성공 시 로컬 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`에 생성된다. [Gradle의 Java 호환표](https://docs.gradle.org/current/userguide/compatibility.html)를 기준으로 JDK를 선택했다.

## 기기별 확인표

1. 로그인 화면·목록·매칭 상세가 앱 안에 표시되는가?
2. 카카오 로그인 중 외부 브라우저/카카오톡으로 나가는가? 인증 완료/취소 후 어느 화면으로 돌아오는가?
3. 외부 앱에서 돌아온 뒤와 앱 강제 종료/재실행 뒤 로그인 상태가 유지되는가?
4. 로그아웃 후 뒤로가기로 이전 계정의 보호된 데이터에 다시 접근할 수 없는가?
5. Android 뒤로가기와 iOS 화면 내 뒤로가기가 정상인가?
6. 키보드가 입력칸·버튼을 가리지 않는가? 노치·홈 표시줄과 겹치지 않는가?
7. 지도/전화 링크가 적절한 외부 앱으로 열리고 복귀 가능한가?
8. 네트워크를 끊은 신규 진입에서 안내가 보이고 다시 연결할 수 있는가?

민감한 URL·쿠키·이메일·전화번호가 포함된 원문 로그는 공유하지 않는다. 통과/실패·기기/OS·재현 순서만 `docs/03-26-native-app-prototype.md`에 기록한다. 브라우저 에뮬레이션이나 `cap sync` 성공은 실제 네이티브 로그인 통과의 증거가 아니다.

공식 안내: https://capacitorjs.com/docs/getting-started/environment-setup

## 의존성 기록

Capacitor 8.5.3으로 버전을 고정했다. CLI의 `xcode` 도구가 간접 참조하는 uuid 7의 npm audit 경고를 해소하기 위해 `xcode > uuid`만 11.1.1로 고정했다. 이 도구가 사용하는 CommonJS `uuid.v4()` 호환성, 실제 Xcode 프로젝트 parse/write 및 iOS·Android sync를 확인했다. `npm audit` 결과는 0건이다. 다음 Capacitor 갱신 시 upstream의 해결 여부를 보고 override를 재검토한다. 앱 서버 의존성에는 적용하지 않았다.

### iOS 화면 안전 영역 (2026-10-10)

웹의 `viewport-fit=cover`와 CSS `env(safe-area-inset-*)`가 안전 여백을 처리하므로 `ios.contentInset`은 `never`를 사용한다. `automatic`을 더하면 화면 높이와 고정 버튼 기준이 어긋날 수 있다. 이 설정 변경은 웹 배포와 별개로 `configure → prepare:ios → Xcode 빌드/설치`가 필요하다. 인증·지도 이동 설정은 유지한다.
