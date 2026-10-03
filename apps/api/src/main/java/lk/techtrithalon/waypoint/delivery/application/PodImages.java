package lk.techtrithalon.waypoint.delivery.application;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

/**
 * Upload policy for proof files: JPEG or PNG only (checked from the bytes, not the declared type),
 * at most {@link #MAX_BYTES}, at most {@link #MAX_PIXELS} pixels; then re-encoded, which drops EXIF
 * and location metadata, and scaled so the longest side is at most {@link #MAX_SIDE}. Photos are
 * stored as JPEG, signatures as PNG.
 */
final class PodImages {
    static final int MAX_BYTES = 5 * 1024 * 1024;
    static final long MAX_PIXELS = 40_000_000L;
    static final int MAX_SIDE = 1600;

    record Image(byte[] bytes, String contentType, int width, int height) {}

    private PodImages() {}

    static Image normalise(byte[] input, boolean signature) {
        if (input == null || input.length == 0) throw invalid("FILE_EMPTY", "The file is empty");
        if (input.length > MAX_BYTES) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "The file is larger than 5 MB");
        if (!isJpeg(input) && !isPng(input)) throw invalid("FILE_TYPE_INVALID", "Upload a JPEG or PNG image");
        BufferedImage source;
        try (ImageInputStream stream = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw invalid("FILE_TYPE_INVALID", "Upload a JPEG or PNG image");
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                // Check the declared size before decoding, so a tiny file cannot expand into a huge bitmap.
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) throw invalid("FILE_TOO_LARGE_PIXELS", "The image is too large");
                source = reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) throw api;
            throw invalid("FILE_UNREADABLE", "The image could not be read");
        }
        double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage target = new BufferedImage(width, height, signature ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            if (!signature) { g.setColor(Color.WHITE); g.fillRect(0, 0, width, height); }
            g.drawImage(source, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }
        try {
            var out = new ByteArrayOutputStream();
            if (signature) {
                ImageIO.write(target, "png", out);
                return new Image(out.toByteArray(), "image/png", width, height);
            }
            var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(ios);
                ImageWriteParam param = writer.getDefaultWriteParam();
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(0.8f);
                writer.write(null, new IIOImage(target, null, null), param);
            } finally {
                writer.dispose();
            }
            return new Image(out.toByteArray(), "image/jpeg", width, height);
        } catch (IOException e) {
            throw invalid("FILE_UNREADABLE", "The image could not be read");
        }
    }

    private static boolean isJpeg(byte[] b) { return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF; }

    private static boolean isPng(byte[] b) {
        return b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
    }

    private static ApiException invalid(String code, String message) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message); }
}
