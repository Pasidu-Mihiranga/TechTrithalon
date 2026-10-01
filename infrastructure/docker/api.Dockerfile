# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# 1. Gradle distribution — its own layer, so it is downloaded once and cached.
COPY apps/api/gradlew apps/api/settings.gradle.kts ./
COPY apps/api/gradle/ gradle/
RUN --mount=type=cache,target=/root/.gradle ./gradlew --version --no-daemon

# 2. Dependencies — re-resolved only when the build files change.
COPY apps/api/build.gradle.kts ./
RUN --mount=type=cache,target=/root/.gradle ./gradlew dependencies --no-daemon -q > /dev/null

# 3. Sources.
COPY apps/api/src/ src/
RUN --mount=type=cache,target=/root/.gradle ./gradlew bootJar -x test --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 waypoint
COPY --from=build /workspace/build/libs/*.jar app.jar
USER waypoint
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
