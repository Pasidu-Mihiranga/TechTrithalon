package lk.techtrithalon.waypoint.reference.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.GeographyView;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

/** Serves public district boundaries joined with the caller's district travel rows. */
@Service
public class GeographyService {
    private static final String RESOURCE = "geography/sri-lanka-districts.geojson";
    private final ReferenceService reference;
    private final JsonNode source;
    private final ObjectMapper mapper;

    public GeographyService(ReferenceService reference, ObjectMapper mapper) {
        this.reference = reference;
        this.mapper = mapper;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            this.source = mapper.readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("District geography is missing or unreadable: " + RESOURCE, e);
        }
    }

    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public GeographyView view(CurrentUser user) {
        List<DistrictTravel> scoped = reference.districts(user);
        Map<String, DistrictTravel> byDistrict = scoped.stream()
            .collect(Collectors.toMap(DistrictTravel::district, t -> t, (a, b) -> a));
        var scopedDepots = scoped.stream().map(DistrictTravel::depot).collect(Collectors.toSet());

        List<GeographyView.Depot> depots = new ArrayList<>();
        for (JsonNode d : source.path("depots")) {
            if (scopedDepots.contains(d.path("name").asText())) {
                depots.add(new GeographyView.Depot(d.path("name").asText(), d.path("lat").asDouble(), d.path("lng").asDouble(), d.path("basis").asText()));
            }
        }
        List<GeographyView.District> districts = new ArrayList<>();
        for (JsonNode f : source.path("features")) {
            String name = f.path("properties").path("district").asText();
            DistrictTravel travel = byDistrict.get(name);
            JsonNode label = f.path("properties").path("label");
            districts.add(new GeographyView.District(name, travel != null, travel == null ? null : travel.depot(),
                List.of(label.get(0).asDouble(), label.get(1).asDouble()),
                mapper.convertValue(f.path("geometry"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {})));
        }
        List<GeographyView.Link> links = scoped.stream()
            .sorted((a, b) -> a.district().compareTo(b.district()))
            .map(t -> new GeographyView.Link(t.district(), t.depot(), t.depotToDistrictKm(), t.depotToDistrictMinutes(),
                t.interStopKm(), t.interStopMinutes(), t.roadClass()))
            .toList();
        return new GeographyView(source.path("attribution").asText(), depots, districts, links);
    }
}
