import type { Row } from "../types.ts";
import {
  date,
  display,
  id,
  money,
  name,
  number,
  text,
  tone,
} from "../value.ts";
import { createReviewRows } from "./dashboardReviews.ts";

export const createFarmerData = (
  tables: Record<string, Row[]>,
  usersById: Map<string, Row>,
) => {
  const textArray = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === "string" && Boolean(item.trim()),
        )
      : [];
  const commoditiesByFarm = new Map<string, Row[]>();
  tables.commodities.forEach((commodity) => {
    const farmId = id(commodity.farm_id);
    commoditiesByFarm.set(farmId, [
      ...(commoditiesByFarm.get(farmId) ?? []),
      commodity,
    ]);
  });
  const farmers = tables.farmers.map((farmer) => {
    const user = usersById.get(id(farmer.farmer_user_id));
    const accountStatus = text(farmer.account_status).toLowerCase();
    const status = display(
      ["suspended", "deactivated", "inactive"].includes(accountStatus)
        ? accountStatus
        : farmer.verification_status,
      "Pending",
    );
    const farmCount = tables.farms.filter(
      (farm) => id(farm.farmer_user_id) === id(farmer.farmer_user_id),
    ).length;
    return {
      entityId: id(farmer.farmer_user_id),
      primary: user
        ? name(user, "Farmer")
        : `Farmer ${id(farmer.farmer_user_id)}`,
      secondary: user
        ? text(user.email, "Email not recorded")
        : "User profile not recorded",
      category: display(farmer.specialty ?? farmer.farming_type, "Farmer"),
      value: `${farmCount} farms registered`,
      status,
      tone: tone(status),
    };
  });
  const farms = tables.farms.map((farm) => {
    const commodities = commoditiesByFarm.get(id(farm.farm_id)) ?? [];
    const status = display(farm.farm_status ?? farm.status, "Active");
    const farmName = text(farm.farm_name, `Farm ${id(farm.farm_id)}`);
    const farmImages = textArray(farm.farm_images).map((imageUrl, index) => ({
      alt: `${farmName} image ${index + 1}`,
      imageUrl,
      title: `Farm image ${index + 1}`,
    }));
    const coverImage = text(farm.cover_image_url);
    if (
      coverImage &&
      !farmImages.some((image) => image.imageUrl === coverImage)
    ) {
      farmImages.unshift({
        alt: `${farmName} cover image`,
        imageUrl: coverImage,
        title: "Farm cover image",
      });
    }
    return {
      id: id(farm.farm_id),
      farmerId: id(farm.farmer_user_id),
      farmName,
      farmLocation: text(
        farm.farm_location ?? farm.location,
        [text(farm.city_municipality), text(farm.province)]
          .filter(Boolean)
          .join(", ") || "Location not set",
      ),
      farmSizeHectares: number(farm.farm_size_hectares ?? farm.farm_size),
      farmingType: display(farm.farming_type, "Not specified"),
      soilType: display(farm.soil_type, "Not specified"),
      irrigationType: display(farm.irrigation_type, "Not specified"),
      mainCrops: textArray(farm.main_crops),
      certifications: textArray(farm.certifications),
      commodities: commodities.map((item) =>
        text(item.commodity_name, "Unnamed commodity"),
      ),
      farmImages,
      gpsLat: number(farm.gps_lat ?? farm.gps_latitude ?? farm.latitude),
      gpsLong: number(farm.gps_long ?? farm.gps_longitude ?? farm.longitude),
      totalCrops:
        farm.total_crops === null ||
        farm.total_crops === undefined ||
        farm.total_crops === ""
          ? commodities.length
          : number(farm.total_crops, commodities.length),
      status,
      tone: tone(status),
    };
  });
  return { farmerFarms: farms, farmerRecords: farmers };
};

export const createEntityRows = (
  tables: Record<string, Row[]>,
  indexes: Record<string, Map<string, Row>>,
  farmerRecords: Record<string, unknown>[],
  farmerFarms: Record<string, unknown>[],
) => {
  const companiesById = indexes.companiesById;
  const riderRecord = (rider: Row) => {
    const company = companiesById.get(
      id(rider.logistics_company_id ?? rider.company_id),
    );
    const status = display(
      rider.availability_status ?? rider.employment_status,
      "Pending",
    );
    const employment = display(rider.employment_status, "Pending approval");
    const deliveries = number(rider.total_deliveries);
    return {
      approvalStatus: employment === "Active" ? "Approved" : employment,
      approvalTone: tone(employment),
      category: company
        ? text(company.company_name, "Logistics company")
        : "Independent",
      entityId: id(rider.rider_id),
      primary: name(rider, `Rider ${id(rider.rider_id)}`),
      secondary: text(
        rider.email ?? rider.contact_number,
        "Contact not recorded",
      ),
      status,
      tone: tone(status),
      value: `${display(rider.vehicle_type, "Vehicle not recorded")} · ${deliveries} ${
        deliveries === 1 ? "delivery" : "deliveries"
      }`,
    };
  };
  const entityRows: Record<string, unknown[]> = {
    Users: tables.users.map((user) => ({
      category: display(user.account_role, "User"),
      primary: name(user, `User ${id(user.user_id)}`),
      secondary: text(user.email, "Email not recorded"),
      value: `Joined ${date(user.created_at)}`,
      status: display(user.account_status, "Pending"),
      tone: tone(user.account_status),
    })),
    Farmers: farmerRecords,
    Farms: farmerFarms.map((farm) => ({
      category: farm.farmingType,
      entityId: farm.id,
      gpsLat: farm.gpsLat,
      gpsLong: farm.gpsLong,
      primary: farm.farmName,
      secondary: farm.farmLocation,
      status: farm.status,
      tone: farm.tone,
      value: `${farm.farmSizeHectares} hectares`,
    })),
    Commodities: tables.commodities.map((commodity) => {
      const status = display(commodity.commodity_status, "Available");
      const farm = indexes.farmsById.get(id(commodity.farm_id));
      const category = indexes.categoriesById.get(id(commodity.category_id));
      return {
        category: category
          ? text(category.category_name, "Uncategorized")
          : "Uncategorized",
        primary: text(
          commodity.commodity_name,
          `Commodity ${id(commodity.commodity_id)}`,
        ),
        secondary: farm
          ? text(farm.farm_name, "Farm not named")
          : "Farm not recorded",
        value: `${money(commodity.price_per_unit)} / ${text(commodity.unit_type, "unit")}`,
        status,
        tone: tone(status),
      };
    }),
    "Logistics Companies": tables.riders.map(riderRecord),
    Riders: tables.riders.map(riderRecord),
    Deliveries: tables.deliveries.map((delivery) => {
      const status = display(delivery.delivery_status, "Pending");
      return {
        entityId: id(delivery.delivery_id),
        category: `Order #AG-${id(delivery.order_id)}`,
        primary: `Delivery ${id(delivery.delivery_id)}`,
        secondary: text(delivery.dropoff_location, "Drop-off location not set"),
        value: `ETA: ${date(delivery.estimated_delivery_time)}`,
        status,
        tone: tone(status),
      };
    }),
    Payments: tables.payments.map((payment) => {
      const status = display(
        payment.collection_status ?? payment.payment_status,
        "Pending",
      );
      return {
        category: display(payment.payment_method, "Not set"),
        primary: `Payment ${id(payment.payment_id)}`,
        secondary: `Order #AG-${id(payment.order_id)}`,
        value: money(payment.amount),
        status,
        tone: tone(status),
      };
    }),
    Reviews: createReviewRows(tables, indexes),
  };
  tables.admin_manual_records.forEach((record) => {
    const section = text(record.section);
    if (!entityRows[section]) entityRows[section] = [];
    entityRows[section].unshift({
      category: "Admin-created draft",
      entityId: `manual-${id(record.record_id)}`,
      primary: text(record.name, "Unnamed record"),
      secondary: `Created ${date(record.created_at)}`,
      status: "Pending",
      tone: "orange",
      value: "Details required",
    });
  });
  return entityRows;
};
